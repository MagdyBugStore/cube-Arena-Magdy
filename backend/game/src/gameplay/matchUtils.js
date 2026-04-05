export function formatTimeMMSS(totalSec) {
  const t = Math.max(0, Math.floor(Number(totalSec) || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function computeWinnerByValue(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  let best = list[0];
  let bestV = best?.head?.value ?? -Infinity;
  for (let i = 1; i < list.length; i += 1) {
    const p = list[i];
    const v = p?.head?.value ?? -Infinity;
    if (v > bestV) {
      best = p;
      bestV = v;
    }
  }
  return best;
}

