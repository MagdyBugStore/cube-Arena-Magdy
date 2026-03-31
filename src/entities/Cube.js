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

export class Cube {
  constructor({ value = 1, color = "#c65b5f", size = .5, cornerRadius = 0.06, parent } = {}) {
    this.value = value;
    this.targetYaw = Math.PI / 4;
    this.currentYaw = this.targetYaw;
    this.size = size;

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
    if (this.value === value) return;
    this.value = value;
    const oldMap = this.numberMaterial.map;
    const numberTextureSize = Math.max(256, Math.min(1024, Math.round(512 * (this.size / 1.2))));
    this.numberMaterial.map = makeNumberTexture(formatValueShort(value), { size: numberTextureSize });
    this.numberMaterial.needsUpdate = true;
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
