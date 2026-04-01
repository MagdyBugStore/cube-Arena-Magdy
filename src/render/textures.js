import { THREE } from "../vendor/three.js";

export function makeDottedGroundTexture({ size = 1024, cell = 100, dotSize = 5.0, dotRadius, repeat = 7 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#173a5c";
  ctx.fillRect(0, 0, size, size);

  const r = typeof dotRadius === "number" ? dotRadius : dotSize;
  ctx.fillStyle = "rgba(120, 190, 255, 0.35)";
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

function makeCanvasTexture(canvas, { repeat = 1, clamp = false, filter = "linear" } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (clamp) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  } else {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }
  texture.generateMipmaps = false;
  if (filter === "nearest") {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
  } else {
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
  }
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

export function makeFootballFieldTexture({ size = 4500, arenaSize = 18, platformSize = 34 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const center = size / 2;
  const scale = size / Math.max(1, Number(platformSize) || 1);
  const halfArenaPx = (Math.max(1, Number(arenaSize) || 1) / 2) * scale;
  const arenaW = halfArenaPx * 2;
  const arenaH = halfArenaPx * 2;

  ctx.fillStyle = "#1d6f36";
  ctx.fillRect(0, 0, size, size);

  const maxPitchW = arenaW * 0.92;
  const maxPitchH = arenaH * 0.92;
  const targetAspect = 105 / 68;
  const pitchW = Math.min(maxPitchW, maxPitchH * targetAspect);
  const pitchH = pitchW / targetAspect;
  const pitchX0 = center - pitchW / 2;
  const pitchY0 = center - pitchH / 2;

  ctx.fillStyle = "#1b6632";
  ctx.fillRect(pitchX0, pitchY0, pitchW, pitchH);

  const stripeCount = Math.max(10, Math.round(pitchW / 70));
  const stripeW = pitchW / stripeCount;
  for (let i = 0; i < stripeCount; i += 1) {
    const xx = pitchX0 + i * stripeW;
    ctx.fillStyle = i % 2 === 0 ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
    ctx.fillRect(xx, pitchY0, stripeW, pitchH);
  }

  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  const lineW = Math.max(2, Math.floor(size * 0.0002));
  ctx.lineWidth = lineW;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";

  const pitchCenterX = pitchX0 + pitchW / 2;
  const pitchCenterY = pitchY0 + pitchH / 2;
  const metersToPxW = (m) => (m / 105) * pitchW;
  const metersToPxH = (m) => (m / 68) * pitchH;

  const snapBias = lineW % 2 === 0 ? 0 : 0.5;
  const snap = (v) => Math.round(v) + snapBias;

  const strokeRect = (x, y, w, h) => {
    const xx = snap(x);
    const yy = snap(y);
    const ww = Math.round(w);
    const hh = Math.round(h);
    ctx.strokeRect(xx + lineW / 2, yy + lineW / 2, ww - lineW, hh - lineW);
  };

  const strokePath = (builder) => {
    const p = new Path2D();
    builder(p);
    ctx.stroke(p);
  };

  strokeRect(pitchX0, pitchY0, pitchW, pitchH);

  strokePath((p) => {
    p.moveTo(snap(pitchCenterX), snap(pitchY0));
    p.lineTo(snap(pitchCenterX), snap(pitchY0 + pitchH));
  });

  const circleR = metersToPxH(9.15);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokePath((p) => {
    p.arc(pitchCenterX, pitchCenterY, circleR, 0, Math.PI * 2);
  });
  ctx.restore();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(pitchCenterX, pitchCenterY, Math.max(2, lineW * 0.55), 0, Math.PI * 2);
  ctx.fill();

  const penaltyDepth = metersToPxW(16.5);
  const penaltyWidth = metersToPxH(40.32);
  const goalDepth = metersToPxW(5.5);
  const goalWidth = metersToPxH(18.32);
  const penaltySpotDist = metersToPxW(11);

  const leftPenaltyX = pitchX0;
  const rightPenaltyX = pitchX0 + pitchW - penaltyDepth;
  const penaltyY = pitchCenterY - penaltyWidth / 2;

  strokeRect(leftPenaltyX, penaltyY, penaltyDepth, penaltyWidth);
  strokeRect(rightPenaltyX, penaltyY, penaltyDepth, penaltyWidth);

  const leftGoalY = pitchCenterY - goalWidth / 2;
  strokeRect(pitchX0, leftGoalY, goalDepth, goalWidth);
  strokeRect(pitchX0 + pitchW - goalDepth, leftGoalY, goalDepth, goalWidth);

  const leftSpotX = pitchX0 + penaltySpotDist;
  const rightSpotX = pitchX0 + pitchW - penaltySpotDist;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(snap(leftSpotX), snap(pitchCenterY), Math.max(2, lineW * 0.5), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(snap(rightSpotX), snap(pitchCenterY), Math.max(2, lineW * 0.5), 0, Math.PI * 2);
  ctx.fill();

  const arcR = metersToPxH(9.15);
  const dx = penaltyDepth - penaltySpotDist;
  const clamped = Math.max(-arcR + 0.001, Math.min(arcR - 0.001, dx));
  const dy = Math.sqrt(Math.max(0, arcR * arcR - clamped * clamped));
  const arcA = Math.atan2(dy, clamped);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  strokePath((p) => {
    p.arc(leftSpotX, pitchCenterY, arcR, -arcA, arcA);
  });
  strokePath((p) => {
    p.arc(rightSpotX, pitchCenterY, arcR, Math.PI - arcA, Math.PI + arcA);
  });
  ctx.restore();

  const cornerR = metersToPxH(0.7);
  const corners = [
    [pitchX0, pitchY0, 0, Math.PI / 2],
    [pitchX0 + pitchW, pitchY0, Math.PI / 2, Math.PI],
    [pitchX0 + pitchW, pitchY0 + pitchH, Math.PI, (Math.PI * 3) / 2],
    [pitchX0, pitchY0 + pitchH, (Math.PI * 3) / 2, Math.PI * 2],
  ];
  for (const [cx, cy, a0, a1] of corners) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokePath((p) => {
      p.arc(cx, cy, cornerR, a0, a1);
    });
    ctx.restore();
  }

  return makeCanvasTexture(canvas, { clamp: true });
}

export function makeTennisCourtTexture({ size = 2048, arenaSize = 18, platformSize = 34 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0c1c2b";
  ctx.fillRect(0, 0, size, size);

  const center = size / 2;
  const scale = size / Math.max(1, Number(platformSize) || 1);
  const halfArenaPx = (Math.max(1, Number(arenaSize) || 1) / 2) * scale;

  const x0 = center - halfArenaPx;
  const y0 = center - halfArenaPx;
  const w = halfArenaPx * 2;
  const h = halfArenaPx * 2;

  ctx.fillStyle = "#0b3b6a";
  ctx.fillRect(x0, y0, w, h);

  const apron = Math.max(6, Math.floor(w * 0.08));
  ctx.fillStyle = "rgba(27, 120, 68, 0.35)";
  ctx.fillRect(x0 + apron, y0 + apron, w - apron * 2, h - apron * 2);

  const lineW = Math.max(2, Math.floor(size * 0.002));
  ctx.lineWidth = lineW;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  const courtX0 = x0 + apron;
  const courtY0 = y0 + apron;
  const courtW = w - apron * 2;
  const courtH = h - apron * 2;
  const snapBias = lineW % 2 === 0 ? 0 : 0.5;
  const snap = (v) => Math.round(v) + snapBias;
  const rx = snap(courtX0);
  const ry = snap(courtY0);
  const rw = Math.round(courtW);
  const rh = Math.round(courtH);
  ctx.strokeRect(rx + lineW / 2, ry + lineW / 2, rw - lineW, rh - lineW);

  const singlesInset = courtW * 0.13;
  const serviceInsetY = courtH * 0.22;

  ctx.beginPath();
  ctx.moveTo(snap(courtX0 + singlesInset), ry);
  ctx.lineTo(snap(courtX0 + singlesInset), ry + rh);
  ctx.moveTo(snap(courtX0 + courtW - singlesInset), ry);
  ctx.lineTo(snap(courtX0 + courtW - singlesInset), ry + rh);
  ctx.stroke();

  const midY = snap(courtY0 + courtH / 2);
  ctx.beginPath();
  ctx.moveTo(rx, midY);
  ctx.lineTo(rx + rw, midY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(snap(courtX0 + singlesInset), snap(courtY0 + serviceInsetY));
  ctx.lineTo(snap(courtX0 + courtW - singlesInset), snap(courtY0 + serviceInsetY));
  ctx.moveTo(snap(courtX0 + singlesInset), snap(courtY0 + courtH - serviceInsetY));
  ctx.lineTo(snap(courtX0 + courtW - singlesInset), snap(courtY0 + courtH - serviceInsetY));
  ctx.stroke();

  const centerX = courtX0 + courtW / 2;
  ctx.beginPath();
  ctx.moveTo(snap(centerX), snap(courtY0 + serviceInsetY));
  ctx.lineTo(snap(centerX), snap(courtY0 + courtH - serviceInsetY));
  ctx.stroke();

  return makeCanvasTexture(canvas, { clamp: true, filter: "nearest" });
}

export function makeInterlockPaversTexture({ size = 1024, cell = 150, repeat = 6 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#4b5054";
  ctx.fillRect(0, 0, size, size);

  const mortar = Math.max(2, Math.floor(cell * 0.06));
  const rows = Math.ceil(size / cell) + 2;
  const cols = Math.ceil(size / cell) + 2;

  for (let y = -1; y < rows; y += 1) {
    for (let x = -1; x < cols; x += 1) {
      const offset = (y % 2) * (cell * 0.5);
      const px = x * cell + offset;
      const py = y * cell;
      const w = cell - mortar;
      const h = cell - mortar;
      const shade = ((x + y) % 3) * 14;
      ctx.fillStyle = `rgb(${72 + shade}, ${76 + shade}, ${80 + shade})`;
      ctx.fillRect(px + mortar / 2, py + mortar / 2, w, h);
    }
  }

  return makeCanvasTexture(canvas, { repeat });
}

export function makeGeometricGroundTexture({ size = 1024, cell = 110, repeat = 6 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#132944";
  ctx.fillRect(0, 0, size, size);

  const c = Math.max(18, Math.floor(Number(cell) || 110));
  const strokeW = Math.max(2, Math.floor(c * 0.06));
  const cols = Math.ceil(size / c) + 2;
  const rows = Math.ceil(size / c) + 2;

  for (let y = -1; y < rows; y += 1) {
    for (let x = -1; x < cols; x += 1) {
      const px = x * c;
      const py = y * c;
      const flip = (x + y) % 2 === 0;
      ctx.beginPath();
      if (flip) {
        ctx.moveTo(px, py);
        ctx.lineTo(px + c, py);
        ctx.lineTo(px + c, py + c);
      } else {
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + c);
        ctx.lineTo(px + c, py + c);
      }
      ctx.closePath();
      const shade = flip ? "rgba(120, 190, 255, 0.10)" : "rgba(20, 40, 70, 0.22)";
      ctx.fillStyle = shade;
      ctx.fill();
    }
  }

  ctx.strokeStyle = "rgba(180, 220, 255, 0.16)";
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  for (let y = 0; y <= size; y += c) {
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
  }
  for (let x = 0; x <= size; x += c) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
  }
  ctx.stroke();

  return makeCanvasTexture(canvas, { repeat });
}

export function makeNumberTexture(text, { size = 512 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.floor(size * 0.06);
  ctx.shadowOffsetY = Math.floor(size * 0.03);

  const baseFontSize = Math.floor(size * 0.82);
  const fontFamily = `"Comic Sans MS", "Arial Black", system-ui, sans-serif`;
  ctx.font = `900 ${baseFontSize}px ${fontFamily}`;

  const paddingX = size * 0.12;
  const maxTextWidth = size - paddingX * 2;
  const baseMetrics = ctx.measureText(text);
  const widthScale = baseMetrics.width > 0 ? Math.min(1, maxTextWidth / baseMetrics.width) : 1;
  const fontSize = Math.max(12, Math.floor(baseFontSize * widthScale));
  ctx.font = `900 ${fontSize}px ${fontFamily}`;

  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.7;
  const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.25;
  const textY = size / 2 + (ascent - descent) / 2;

  ctx.lineWidth = Math.max(2, Math.floor(fontSize * 0.09));
  ctx.strokeStyle = "#0b1020";
  ctx.strokeText(text, size / 2, textY);

  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, size / 2, textY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
