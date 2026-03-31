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
