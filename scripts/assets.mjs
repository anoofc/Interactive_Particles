import { mkdir, readdir, copyFile, writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const model = new URL('public/models/hand_landmarker.task', root);
const source = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
await mkdir(new URL('public/wasm/', root), { recursive:true });
await mkdir(new URL('public/models/', root), { recursive:true });
const pkg = JSON.parse(await readFile(new URL('node_modules/@mediapipe/tasks-vision/package.json',root),'utf8'));
for (const file of await readdir(new URL('node_modules/@mediapipe/tasks-vision/wasm/',root))) {
  if (/\.(wasm|js)$/.test(file)) await copyFile(new URL(`node_modules/@mediapipe/tasks-vision/wasm/${file}`,root),new URL(`public/wasm/${file}`,root));
}
let bytes;
try { bytes = await readFile(model); } catch { /* initial download */ }
if (!bytes || bytes.length < 1000000) {
  console.log('Downloading the official Hand Landmarker model (one-time download)...');
  try {
    const response = await fetch(source,{signal:AbortSignal.timeout(120000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1000000) throw new Error('Incomplete model download');
    await writeFile(new URL('public/models/hand_landmarker.task.tmp',root),bytes);
    await rename(new URL('public/models/hand_landmarker.task.tmp',root),model);
  } catch(error) { console.error('Model download failed. Check your connection, then run npm run assets. Mouse mode remains available.',error.message); process.exitCode=1; }
}
if (bytes) {
  await writeFile(new URL('public/models/manifest.json',root),JSON.stringify({tasksVision:pkg.version,modelVersion:1,source,sha256:createHash('sha256').update(bytes).digest('hex')},null,2));
  console.log(`Local model ready; WASM copied from tasks-vision ${pkg.version}.`);
}
