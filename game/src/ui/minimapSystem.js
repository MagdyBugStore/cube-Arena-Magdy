export function installMinimap({
  enabled,
  env,
  mapSize,
  clamp,
  clamp01,
  freeCubeSpawner,
  multiplayerEnabled,
  getPlayers,
  getRemotes,
  getLocalPlayer,
  getLocalJoined,
} = {}) {
  if (!enabled) return null;
  const hudEl = document.getElementById("hud");
  const miniHudEl = document.getElementById("minimapHud");
  const hostEl = miniHudEl ?? hudEl;
  if (!hostEl) return null;

  const isSmall = matchMedia?.("(max-width: 600px)")?.matches ?? innerWidth <= 600;
  const wrap = document.createElement("div");
  wrap.className = "minimap";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "6px";
  wrap.style.userSelect = "none";
  wrap.style.pointerEvents = "auto";

  const title = document.createElement("div");
  title.textContent = "الخريطة";
  title.style.fontWeight = "900";
  title.style.opacity = "0.9";
  title.style.userSelect = "none";
  title.style.cursor = "pointer";

  const canvas = document.createElement("canvas");
  const size = isSmall ? 120 : 180;
  canvas.className = "minimapCanvas";
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.borderRadius = "12px";
  canvas.style.background = "rgba(0, 0, 0, 0.18)";
  canvas.style.border = "1px solid rgba(255, 255, 255, 0.12)";

  let collapsed = Boolean(isSmall);
  const applyCollapsed = () => {
    canvas.style.display = collapsed ? "none" : "block";
    wrap.style.gap = collapsed ? "0px" : "6px";
  };
  applyCollapsed();
  title.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      collapsed = !collapsed;
      applyCollapsed();
    },
    { passive: false },
  );

  wrap.append(title, canvas);
  hostEl.append(wrap);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;

  const m = { canvas, ctx, size, nextDrawAtSec: 0 };

  function draw(nowSec) {
    if (nowSec < (m.nextDrawAtSec ?? 0)) return;
    m.nextDrawAtSec = nowSec + 1 / 15;

    const half = mapSize / 2;
    const span = Math.max(1e-6, mapSize);
    const edgePad = 0.5;
    const usable = size - edgePad * 2;
    const toMini = (x, z) => {
      const u = clamp01((x + half) / span);
      const v = clamp01((z + half) / span);
      const x0 = edgePad + u * usable;
      const y0 = edgePad + (1 - v) * usable;
      return { x: y0, y: x0 };
    };

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(6, 12, 22, 0.65)";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

    const cubes = freeCubeSpawner?.cubes;
    if (Array.isArray(cubes) && cubes.length > 0) {
      const samples = Math.min(120, cubes.length);
      ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
      for (let i = 0; i < samples; i += 1) {
        const entry = cubes[(Math.random() * cubes.length) | 0];
        const c = entry?.cube;
        const p = c?.mesh?.position;
        if (!p) continue;
        const mp = toMini(p.x, p.z);
        ctx.fillRect(mp.x, mp.y, 2, 2);
      }
    }

    const list = getPlayers?.() ?? [];
    const remotes = multiplayerEnabled ? getRemotes?.() ?? [] : [];
    const allPlayers = remotes.length > 0 ? list.concat(remotes) : list;
    const localPlayer = getLocalPlayer?.();
    const localJoined = Boolean(getLocalJoined?.());

    for (const p of allPlayers) {
      if (!p?.head?.mesh) continue;
      if (p.eliminated) continue;
      const pos = p.head.mesh.position;
      const v = Math.max(1, p.head.value ?? 1);
      const r = clamp(2 + Math.log2(v) * 0.35, 2, 7.5);
      const mp = toMini(pos.x, pos.z);
      const isYou = p === localPlayer && localJoined;
      ctx.fillStyle = isYou ? "rgba(120, 190, 255, 0.95)" : "rgba(255, 120, 120, 0.85)";
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, r, 0, Math.PI * 2);
      ctx.fill();

      const dir = p.headDirection;
      if (dir) {
        const dl = Math.sqrt((dir.x ?? 0) * (dir.x ?? 0) + (dir.z ?? 0) * (dir.z ?? 0)) || 1;
        const dx = (dir.x ?? 0) / dl;
        const dz = (dir.z ?? 0) / dl;
        const tip = toMini(pos.x + dx * 1.25, pos.z + dz * 1.25);
        ctx.strokeStyle = isYou ? "rgba(120, 190, 255, 0.8)" : "rgba(255, 120, 120, 0.65)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(mp.x, mp.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
    }
  }

  env.addUpdatable({
    update(dt, t) {
      const nowSec = (Number.isFinite(t) ? t : performance.now()) * 0.001;
      draw(nowSec);
    },
  });

  return m;
}
