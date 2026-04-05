import { clamp01, lerp } from "./math.js";

export function randomBetween(min, max) {
  return lerp(min, max, Math.random());
}

export function pickWeightedIndex(weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) sum += weights[i];
  if (!(sum > 0)) return 0;
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function pickWeighted(weights) {
  return pickWeightedIndex(weights);
}

export function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

export function jitter01(amount) {
  const a = Math.max(0, Number(amount) || 0);
  return clamp01(0.5 + (Math.random() - 0.5) * 2 * a);
}

