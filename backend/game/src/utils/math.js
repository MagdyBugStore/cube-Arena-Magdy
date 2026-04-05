export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

