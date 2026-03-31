import { THREE } from "../vendor/three.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function sampleAlongTrail(trail, headPos, distanceFromHead, outVec3) {
  if (distanceFromHead <= 0) return outVec3.copy(headPos);
  if (trail.length === 0) return outVec3.copy(headPos);

  let remaining = distanceFromHead;
  let prev = headPos;
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const curr = trail[i];
    const segLen = prev.distanceTo(curr);
    if (segLen <= 1e-6) {
      prev = curr;
      continue;
    }
    if (remaining <= segLen) {
      const t = remaining / segLen;
      return outVec3.copy(prev).lerp(curr, t);
    }
    remaining -= segLen;
    prev = curr;
  }

  return outVec3.copy(trail[0]);
}

export class Player {
  constructor({
    cubeFactory,
    parent,
    mapSize = 18,
    name = "You",
    speed = 2.6,
    tailLength = 8,
    headLevel = 0,
    tailLevel = 0,
  } = {}) {
    this.mapSize = mapSize;
    this.speed = speed;
    this.tailLength = tailLength;
    this.segmentSpacing = undefined;

    this.head = cubeFactory.createFromLevel(headLevel, parent);
    this.head.setName(name);
    this.headDirection = new THREE.Vector3(0, 0, -1);

    this.tail = Array.from({ length: tailLength }, () => {
      const seg = cubeFactory.createFromLevel(tailLevel, parent);
      seg.setName("");
      return seg;
    });

    this._tmpVec3 = new THREE.Vector3();
    this._tmpVec3B = new THREE.Vector3();
    this._trail = [];
  }

  setName(name) {
    this.head.setName(name);
  }

  setPosition(x, y, z) {
    this.head.setPosition(x, y, z);
    for (const seg of this.tail) seg.setPosition(x, y, z);
    if (this.segmentSpacing === undefined) this.segmentSpacing = this.head.size * 0.9;
    this._trail.length = 0;
    const p = this.head.mesh.position.clone();
    const count = this.tail.length + 8;
    for (let i = 0; i < count; i += 1) this._trail.push(p.clone());
  }

  setLookDirFromMove(dirX, dirZ) {
    this.head.setYawTargetFromMove(dirX, dirZ);
  }

  get headPosition() {
    return this.head.mesh.position;
  }

  update(dt) {
    if (this.segmentSpacing === undefined) this.segmentSpacing = this.head.size * 0.9;

    this.head.update(dt);

    const yaw = this.head.currentYaw;
    this.headDirection.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.head.mesh.position.addScaledVector(this.headDirection, this.speed * dt);

    const half = this.mapSize / 2;
    const margin = this.head.size / 2;
    this.head.mesh.position.x = clamp(this.head.mesh.position.x, -half + margin, half - margin);
    this.head.mesh.position.z = clamp(this.head.mesh.position.z, -half + margin, half - margin);
    this.head.mesh.position.y = this.head.size / 2;

    const headPos = this.head.mesh.position;
    if (this._trail.length === 0) this._trail.push(headPos.clone());

    let last = this._trail[this._trail.length - 1];
    this._tmpVec3.copy(headPos).sub(last);
    let dist = this._tmpVec3.length();
    while (dist >= this.segmentSpacing && dist > 1e-6) {
      this._tmpVec3.multiplyScalar(this.segmentSpacing / dist);
      last = last.clone().add(this._tmpVec3);
      this._trail.push(last);
      this._tmpVec3.copy(headPos).sub(last);
      dist = this._tmpVec3.length();
    }

    const maxTrailPoints = this.tail.length + 96;
    if (this._trail.length > maxTrailPoints) this._trail.splice(0, this._trail.length - maxTrailPoints);

    for (let i = 0; i < this.tail.length; i += 1) {
      const seg = this.tail[i];
      const segDist = (i + 1) * this.segmentSpacing;
      const segPos = sampleAlongTrail(this._trail, headPos, segDist, this._tmpVec3);
      seg.mesh.position.copy(segPos);
      seg.mesh.position.y = seg.size / 2;

      const aheadDist = i * this.segmentSpacing;
      const aheadPos = sampleAlongTrail(this._trail, headPos, aheadDist, this._tmpVec3B);
      const dx = aheadPos.x - segPos.x;
      const dz = aheadPos.z - segPos.z;
      seg.setYawTargetFromMove(dx, dz);
      seg.update(dt);
    }
  }
}
