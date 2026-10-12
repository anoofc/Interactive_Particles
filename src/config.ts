/** All gesture distances are in palm-size units; velocities in viewport units/second. */
export const GESTURE = {
  pinchEnter: 0.32, pinchExit: 0.48,
  openEnter: 0.86, openExit: 0.69,
  // A fully extended palm releases immediately; partial gestures retain hysteresis.
  fastOpenEnter: 0.93,
  stabilityMs: 90, lostMs: 220, matchDistance: 0.38,
  smoothingSeconds: 0.055, swipeSpeed: 1.65, swipeCooldownMs: 850,
  twoMinScale: 0.55, twoMaxScale: 1.85,
};
/** Fast release restores the initial cloud through motion, without teleporting particles. */
export const SCATTER = {duration:0.48, radius:5.5, speed:28, response:35, targetPull:12};
export const MAX_PARTICLES = 18000;
export const QUALITY = {
  Low: {count:3500, ratio:1, bloom:false},
  Medium: {count:8000, ratio:1.35, bloom:true},
  High: {count:15000, ratio:1.75, bloom:true},
};
export type Quality = keyof typeof QUALITY | 'Auto';
export type Palette = 'Aurora' | 'Fire' | 'Galaxy';
export const PALETTES: Record<Palette, number[]> = {
  Aurora:[0x32e9e0,0x4285ff,0xa26eff], Fire:[0xffdc69,0xff843c,0xf64362], Galaxy:[0xff68cf,0xb877ff,0x4c8eff],
};
