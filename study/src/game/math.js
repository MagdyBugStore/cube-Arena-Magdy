export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function smoothingT(lerpPerSecond, dt) {
  return 1 - Math.exp(-lerpPerSecond * dt);
}
