export function normalizeArenaType(value) {
  return String(value ?? "default").trim().toLowerCase() || "default";
}

export function movementBoundsForArena(arenaType, size) {
  const t = normalizeArenaType(arenaType);
  const s = Math.max(1, Number(size) || 1);
  if (t === "football" || t === "soccer") {
    const pitchW = s * 0.92;
    const targetAspect = 105 / 68;
    const pitchH = pitchW / targetAspect;
    return { halfX: pitchW / 2, halfZ: pitchH / 2 };
  }
  const half = s / 2;
  return { halfX: half, halfZ: half };
}

export function loadArenaType() {
  try {
    return normalizeArenaType(localStorage.getItem("arena"));
  } catch {
    return "default";
  }
}

export function saveArenaType(value) {
  const next = normalizeArenaType(value);
  try {
    localStorage.setItem("arena", next);
  } catch {
  }
  return next;
}

