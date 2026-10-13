# Particle Playground

A fullscreen, browser-local light installation. Vite + TypeScript, Three.js shader points and restrained bloom, MediaPipe Tasks Vision Hand Landmarker. No backend, API key, recording, analytics, or camera-frame uploads.

## Run locally

Use Node.js **22.12+** (Node 24 recommended) and npm.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173** (Vite prints the actual port if occupied). Click **Start Camera**, grant video permission, and hold one or two hands in view. Camera permission is requested only by the Start/Retry actions. Audio is always disabled. **Try with Mouse** works without camera permission or tracking assets.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Preview serves the production build at **http://localhost:4173**. The included lockfile and exact package versions make installation reproducible. Dependencies were installed and audited with no reported vulnerabilities during implementation.

## Assets and offline operation

`npm ci` runs `scripts/assets.mjs`. It copies **all WASM binaries and loaders from the installed `@mediapipe/tasks-vision@1.1.0` package** to `public/wasm/`. Do not substitute another release's WASM. It downloads the official float16 **Hand Landmarker model version 1** to `public/models/hand_landmarker.task` (~7.5 MB). The download URL is:

https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

`public/models/manifest.json` records model source, version, SHA-256, and package version. A model download failure fails installation with a clear retry instruction. After restoring network connectivity, run:

```sh
npm run assets
```

Assets are already present in this workspace. No CDN, remote fonts, or runtime model downloads are used. Vite copies `public/` into `dist/`. After obtaining dependencies and assets and building, the application can run offline through `npm run preview` or another local HTTP server serving `dist/`. It is not a service-worker/PWA cache: keep the local server running. Initial npm installation and an absent model's initial download require internet access. Do not open `index.html` with `file://`.

Integration follows the [official MediaPipe web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js), its installed version's API declarations, and Google's [worker implementation](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts). Model and WASM assets originate from Google / the MediaPipe npm package; retain their upstream licensing when redistributing.

## Play

| Input | Effect |
| --- | --- |
| Move a hand | Flowing particle trail; faster motion adds energy |
| Clearly open palm | Fluid outward scatter only after pinch/closed palm, then radial repulsion |
| Thumb/index pinch or closed palm | Gather a compact orbiting light cluster |
| Two open palms, move apart/together | Expand/compress relative to the distance when activated |
| Deliberate fast swipe | Directional wave with cooldown; suppressed while pinching |
| Mouse movement | Trail |
| Hold pointer down | Gather |
| Shift + pointer down | Repel |
| Wheel over particle canvas | Expand/compress; prevents page scroll |
| Send a wave | Directional burst (last movement direction, or right when stationary) |

Keyboard: **F** fullscreen, **H** toggle controls, **R** reset, **Escape** restore controls. Escape retains the browser's normal fullscreen-exit behavior. Shortcuts ignore input/select/textarea/contenteditable fields and modified keys.

Controls include Aurora/Fire/Galaxy palettes, Low/Medium/High/Auto quality, particle count, interaction strength, bloom, camera start/stop, camera selector when multiple devices are available, mirrored preview, a hand position indicator toggle (also hides the mouse interaction circle), debug landmarks, reset, fullscreen, and hide/show controls. Controls toggle and the collapsible gesture guide sit in the bottom bar. The guide opens upward and describes both input modes. Debug diagnostics include render FPS, actual inference result rate, backend, current gestures, and handedness classification confidence. MediaPipe does not expose per-landmark confidence here; the UI explicitly labels what is measured.

## Camera and privacy

Webcam access needs **HTTPS or localhost**. HTTP on a LAN IP is usually insecure; use HTTPS to demonstrate on another device. Check camera permission in browser site settings if previously denied. Close conferencing apps if the camera is busy. Connect/select another camera if unavailable. The app stops media tracks when stopped, switched to mouse, failed, or disposed.

All frame processing happens inside your browser, usually in a worker. Nothing sends frames to a server. The preview is mirrored. Video and interaction mapping both use **contain**, retaining the camera's full aspect ratio with letterboxing rather than cropping. On a wide viewport, interaction occupies the centered camera-aspect region; moving your hand to your right moves the interaction right. Landmark depth is not used as physical depth.

## Implementation and tuning

- `src/config.ts`: documented hand-size-normalized pinch thresholds, open-palm hysteresis, stability window, swipe velocity/cooldown, tracking timeout, scale limits, palettes, and quality defaults.
- `src/gestures.ts`: aspect-correct gesture measurements, smoothing, global two-hand identity matching, stability/hysteresis, baseline capture, swipe arbitration, and faded loss handling.
- `src/camera.ts`: permission-driven video-only acquisition, device enumeration, cancellation, and stream release.
- `src/tracking.ts` / `tracking.worker.ts`: fresh frames at up to ~30 Hz, one inference in flight, module worker with CPU delegate. If worker initialization is unsupported/fails, a separated main-thread scheduler tries CPU inference at up to 20 Hz. Main-thread inference is synchronous and can cause occasional render stalls. Model/WASM failures surface with Retry and Mouse actions.
- `src/particles.ts`: preallocated position/velocity/seed/tail buffers, delta-time forces, idle curl-like motion, fading local influences, orbital gathering, transient waves, radial scaling, damping, speed/force caps, and offscreen wrapping.
- `src/renderer.ts`: centered, responsive EIS logo (`public/images/eis-logo.png`) behind the particles, with original PNG transparency and glow preserved; the logo is composited after particle bloom, so Bloom affects only particles; saved pre-bloom particle opacity places points and trails in front of the logo instead of washing their colours into its white areas; BufferGeometry points, circular soft-point shaders, additive blending, three lagging point layers for trails, configurable bloom and pixel ratio, GPU cleanup.
- `src/ui.ts`, `main.ts`, `style.css`: accessible controls, responsive layout, lifecycle, pointer input, quality adaptation, and diagnostics.

Default **Auto** starts at 8,000 particles. Low: 3,500; Medium: 8,000; High: 15,000; the count slider spans 1,000–18,000. Change defaults and maximum in `config.ts` (adjust the UI range in `ui.ts` when changing the maximum). Auto reduces count and pixel ratio after six seconds of sustained low performance, with an eight-second cooldown; it disables bloom at low pixel ratios. It does not automatically raise quality, avoiding oscillation. Count chosen manually in Auto can still be reduced; use a fixed quality to retain it. Low disables postprocessing bloom; soft luminous shader points remain.

Gesture priority is two-open-hand scale, then each hand's pinch/closed-palm gather, open palm, and trail. Two-hand forces blend in/out rather than immediately switching. Swipes are transient, with a per-hand cooldown. Gesture and identity state are cleared before reacquisition after loss. Pinch enter/exit values are thumb-index distance divided by estimated palm size. Lower `pinchEnter` for a tighter pinch; increase `stabilityMs` or `smoothingSeconds` if your camera jitters (at the cost of responsiveness). Openness requires four fingers to be straight and extended, helping reject partially open palms. A confidently fully open palm (`fastOpenEnter`) bypasses the gesture stability delay. Only a confirmed pinch or closed palm changing to open triggers a one-shot outward release lasting about 0.6 seconds. The gesture engine emits a numbered release event and retains a confirmed gather for up to 1.2 seconds through intermediate poses; the renderer consumes each event once. True tracking loss clears the armed release. New detections, reappearing already-open hands, and ordinary trail-to-open transitions do not trigger it. Open-palm recognition accepts three clearly extended fingers (including the index) when one finger is foreshortened, while a genuine thumb/index pinch keeps priority. Particles retain their positions, trails, and velocity at activation; a smooth velocity envelope accelerates and decelerates them outward at a bounded speed of 24 scene units/second. There are no stored home positions, and directions vary between releases. The release briefly overrides attraction, including lingering forces from another hand. Holding the palm open continues normal repulsion without repeating the burst. `SCATTER` in `config.ts` controls duration, radius, speed, and response. `closedEnter`/`closedExit` set closed-palm hysteresis. Mouse pinch-to-Shift-repel transitions use the same release.

Detection freshness starts when inference results arrive, while the capture timestamp remains the timestamp passed to MediaPipe. The hand-loss grace adapts to three inference intervals, bounded between 450 and 900 ms, so slow CPU inference does not repeatedly discard hand identity. UI status uses that same grace. Debug shows inference latency and the current grace.

Rendering uses requestAnimationFrame; large frame steps are capped to 33 ms. Inference skips hidden pages and repeated video frames. Rendering and simulation pause while hidden; resume clears stale input and resets the clock. The count buffers are preallocated; no object per particle. Reset restores the field and gesture state.

## Limits and verification

Use a recent desktop Chromium browser for the most predictable WebGL 2 / MediaPipe behavior. Recent Firefox and Safari may work, but worker/WASM behavior and camera/fullscreen policies vary; there is a tracking fallback. CPU inference and high bloom quality can be expensive on older laptops; no fixed frame rate is guaranteed. Good light, visible fingertips, and a clear background improve tracking. Occlusion and hands crossing exactly can still confuse landmark identity; matching favors nearest recent palm plus handedness. A deliberate movement larger than the match radius is treated as a newly acquired hand to avoid effect jumps.

The automated tests cover permission gating, video-only requests, cancellation/track cleanup, insecure contexts, camera error messages, scaled pinch thresholds, openness, mirrored aspect mapping, stability and hysteresis, tracking loss and fade, detection-order changes, swipe cooldown/pinch suppression, two-hand baseline capture, numerical bounds, actual attraction/repulsion, fluid release, closed-palm recognition, varied burst directions, suppression of scatter on initial detection/tracking loss/reacquisition, capture-versus-delivery timestamps, and the full landmark-to-particle pipeline at 5 Hz with dropped inference frames. Build and TypeScript checks are included in the scripts above. Production HTTP verification also checked all 13 emitted files against exact build bytes (including every model/WASM/worker asset). With the production preview running, repeat that check using `node scripts/check-served.mjs`.

**Live webcam and visual browser verification were not available in this execution environment.** Do not interpret the automated tests as real camera testing. Manual verification:

1. Start Camera: observe permission request (video only), loading, then No hands detected. Deny permission and verify Retry / Mouse; test disconnected/busy camera and insecure HTTP where possible.
2. Move your right hand right: preview and interaction should agree. Show both hands, exchange detection order, and check each trail follows its hand.
3. Open palm, partially curl, pinch at near/far distances, release, and swipe. Confirm stable modes, orbiting gather, repulsion, directional wave, and cooldown.
4. Open both palms: entering should not jump. Move apart/together to scale; lower one hand and check smooth return. Lose tracking, wait, and reacquire: no stale pinch, swipe, or automatic scatter. Briefly hide an already open hand and show it again: the particle field must continue without a release burst.
5. Try mouse trails, hold, Shift + hold, wheel, Burst, all palettes, count, quality, bloom, preview/debug, reset, guide, and F/H/R/Escape. Resize to a narrow viewport; use Controls to reopen the mobile panel.
6. Hide the tab and resume: no simulation jump. Stop Camera: browser camera indicator turns off. Temporarily remove a model/WASM asset to verify a clear failure and mouse fallback, then run `npm run assets` to restore.
7. Build, disconnect internet, run production preview, and start camera: all inference assets should load from localhost; confirm Network shows no external requests.
