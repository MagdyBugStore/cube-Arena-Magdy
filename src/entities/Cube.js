import { RoundedBoxGeometry, THREE } from "../vendor/three.js";
import { makeNumberTexture } from "../render/textures.js";

const TAU = Math.PI * 2;

function normalizeAngleRad(angle) {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

function lerpAngleRad(from, to, t) {
  const delta = normalizeAngleRad(to - from);
  return normalizeAngleRad(from + delta * t);
}

function formatValueShort(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Math.abs(n) < 10000) return String(Math.trunc(n) === n ? n : n.toFixed(0));

  const units = ["K", "M", "B", "T", "Q"];
  const sign = n < 0 ? "-" : "";
  let scaled = Math.abs(n);
  let unitIndex = -1;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const decimals = scaled >= 10 ? 0 : 1;
  const rounded = decimals === 0 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  const numText = decimals === 0 ? String(rounded) : String(rounded).replace(/\.0$/, "");
  return `${sign}${numText}${units[unitIndex] ?? ""}`;
}

function makeLabelTexture(text, { width = 512, height = 256 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = Math.floor(height * 0.08);
  ctx.shadowOffsetY = Math.floor(height * 0.05);

  const baseFontSize = Math.floor(height * 0.62);
  const fontFamily = `system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  ctx.font = `800 ${baseFontSize}px ${fontFamily}`;

  const paddingX = width * 0.08;
  const maxTextWidth = width - paddingX * 2;
  const baseMetrics = ctx.measureText(text);
  const widthScale = baseMetrics.width > 0 ? Math.min(1, maxTextWidth / baseMetrics.width) : 1;
  const fontSize = Math.max(10, Math.floor(baseFontSize * widthScale));
  ctx.font = `800 ${fontSize}px ${fontFamily}`;

  const metrics = ctx.measureText(text);
  const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.7;
  const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.25;
  const textY = height / 2 + (ascent - descent) / 2;

  ctx.lineWidth = Math.max(2, Math.floor(fontSize * 0.12));
  ctx.strokeStyle = "#0b1020";
  ctx.strokeText(text, width / 2, textY);

  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, width / 2, textY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export class Cube {
  constructor({ value = 1, color = "#c65b5f", size = .5, cornerRadius = 0.06, parent } = {}) {
    this.value = value;
    this.targetYaw = Math.PI / 4;
    this.currentYaw = this.targetYaw;
    this.size = size;
    this._baseGeometrySize = size;
    this.name = "";
    this.nameMaterial = undefined;
    this.nameSprite = undefined;

    this.mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size, size, size, 8, cornerRadius),
      new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        specular: new THREE.Color("#ffffff"),
        shininess: 60,
      })
    );
    this.mesh.castShadow = true;

    const numberPlaneSize = size ;
    const numberTextureSize = Math.max(256, Math.min(1024, Math.round(512 * (size / 1.2))));
    this.numberMaterial = new THREE.MeshBasicMaterial({
      map: makeNumberTexture(formatValueShort(value), { size: numberTextureSize }),
      transparent: true,
    });
    this.numberPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(numberPlaneSize, numberPlaneSize),
      this.numberMaterial
    );
    this.numberPlane.rotation.x = -Math.PI / 2;
    this.numberPlane.position.y = size / 2 + size * 0.002;
    this.numberPlane.position.z = 0;
    this.mesh.add(this.numberPlane);

    if (parent) parent.add(this.mesh);
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  setValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    if (this.value === n) return;
    this.value = n;

    const palette = Array.isArray(this._palette) ? this._palette : null;
    if (palette && palette.length > 0 && this.mesh?.material?.color) {
      const clamped = Math.max(1, n);
      const exp = Math.max(0, Math.floor(Math.log2(clamped)));
      const color = palette[exp % palette.length];
      this.mesh.material.color.set(color);
    }

    const baseSize = Number(this._baseSize);
    const sizeStep = Number(this._sizeStep);
    const maxLevel = Number(this._maxLevel);
    if (Number.isFinite(baseSize) && Number.isFinite(sizeStep) && Number.isFinite(maxLevel)) {
      const clamped = Math.max(1, n);
      const lvl = Math.max(0, Math.min(maxLevel, Math.floor(Math.log2(clamped))));
      const nextSize = baseSize + sizeStep * lvl;
      const baseGeomSize = this._baseGeometrySize || this.size || nextSize;
      if (baseGeomSize > 0 && nextSize > 0 && nextSize !== this.size) {
        this.size = nextSize;
        this.level = lvl;
        const s = nextSize / baseGeomSize;
        this.mesh.scale.setScalar(s);
      } else {
        this.level = lvl;
      }
    }

    const oldMap = this.numberMaterial.map;
    const numberTextureSize = Math.max(256, Math.min(1024, Math.round(512 * ((this.size || 1) / 1.2))));
    this.numberMaterial.map = makeNumberTexture(formatValueShort(n), { size: numberTextureSize });
    this.numberMaterial.needsUpdate = true;
    if (oldMap) oldMap.dispose();
  }

  setName(name) {
    const nextName = String(name ?? "");
    if (this.name === nextName) return;
    this.name = nextName;

    if (!nextName) {
      if (this.nameSprite) this.mesh.remove(this.nameSprite);
      if (this.nameMaterial?.map) this.nameMaterial.map.dispose();
      if (this.nameMaterial) this.nameMaterial.dispose();
      this.nameSprite = undefined;
      this.nameMaterial = undefined;
      return;
    }

    const oldMap = this.nameMaterial?.map;
    const texture = makeLabelTexture(nextName, { width: 512, height: 256 });
    if (!this.nameSprite) {
      this.nameMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });
      this.nameSprite = new THREE.Sprite(this.nameMaterial);
      this.nameSprite.position.set(0, this.size / 2 + this.size * 0.9, 0);
      const labelH = this.size * 0.55;
      this.nameSprite.scale.set(labelH * 2, labelH, 1);
      this.nameSprite.renderOrder = 10;
      this.mesh.add(this.nameSprite);
      return;
    }

    this.nameMaterial.map = texture;
    this.nameMaterial.needsUpdate = true;
    if (oldMap) oldMap.dispose();
  }

  setYawTargetFromPointer(clientX, clientY, width, height) {
    const dx = clientX - width / 2;
    const dy = clientY - height / 2;
    this.targetYaw = normalizeAngleRad(Math.atan2(dx, -dy));
  }

  setYawTargetFromMove(dirX, dirZ) {
    if (dirX === 0 && dirZ === 0) return;
    this.targetYaw = normalizeAngleRad(Math.atan2(dirX, dirZ) + Math.PI);
  }

  update(dt) {
    const lerpFactor = 1 - Math.pow(0.0001, dt);
    this.currentYaw = lerpAngleRad(this.currentYaw, this.targetYaw, lerpFactor);
    this.mesh.rotation.set(0, this.currentYaw, 0);
  }
}
