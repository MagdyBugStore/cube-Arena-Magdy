import { THREE } from "../vendor/three.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep01(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeInOutCubic01(t) {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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
    movementBounds,
    name = "You",
    speed = 2.6,
    speedDecayPerLevel = 1.02, // speed per level decay
    minSpeed = 1.25,
    pathPointMinDist = 0.22,
    tailLength = 8,
    headLevel = 0,
    tailLevel = 0,
    tailInsertAnimSec = 0.16,
    tailMergeAnimSec = 0.22,
    tailMergeDelaySec = 0.08,
    headPulseDurationSec = 0.22,
    headPulseMaxScale = 1.28,
  } = {}) {
    this.cubeFactory = cubeFactory;
    this.parent = parent;
    this.mapSize = mapSize;
    this.movementBounds = null;
    this.speed = speed;
    this.speedDecayPerLevel = speedDecayPerLevel;
    this.minSpeed = minSpeed;
    this.tailLength = tailLength;
    this.segmentSpacing = undefined;
    this.pathPointMinDist = pathPointMinDist;
    this.knockbackVel = new THREE.Vector3();
    this.knockbackMaxSpeed = 10;
    this.stunTimer = 0;

    this.head = cubeFactory.createFromLevel(headLevel, parent);
    this.head.setName(name);
    this.headDirection = new THREE.Vector3(0, 0, -1);
    this._headBaseScale = this.head.mesh?.scale?.x ?? 1;

    this.tail = Array.from({ length: tailLength }, () => {
      const seg = cubeFactory.createFromLevel(tailLevel, parent);
      seg.setName("");
      return seg;
    });

    this._tmpVec3 = new THREE.Vector3();
    this._tmpVec3B = new THREE.Vector3();
    this._trail = [];

    this.tailInsertQueue = [];
    this._tailInsertAnimSec = tailInsertAnimSec;
    this._tailMergeAnimSec = tailMergeAnimSec;
    this._tailMergeDelaySec = tailMergeDelaySec;
    this._tailMergeDelayTimer = 0;
    this.tailInsertAnim = null;
    this.tailMergeAnims = [];
    this.headTailMergeAnim = null;

    this._headPulseDurationSec = headPulseDurationSec;
    this._headPulseMaxScale = headPulseMaxScale;
    this._headPulseTime = 0;

    this.setMovementBounds(movementBounds);
  }

  setMovementBounds(bounds) {
    if (!bounds) {
      this.movementBounds = null;
      return;
    }
    const halfX = Number(bounds.halfX);
    const halfZ = Number(bounds.halfZ);
    if (!Number.isFinite(halfX) || !Number.isFinite(halfZ) || halfX <= 0 || halfZ <= 0) {
      this.movementBounds = null;
      return;
    }
    this.movementBounds = { halfX, halfZ };
  }

  setName(name) {
    this.head.setName(name);
  }

  setHeadValue(value) {
    this.head.setValue(value);
    this._headBaseScale = this.head.mesh?.scale?.x ?? 1;
  }

  _speedForHeadLevel(level) {
    const lvl = Math.max(1, Math.floor(Number(level) || 1));
    const base = Number(this.speed) || 0;
    const decay = clamp(Number(this.speedDecayPerLevel) || 0.99, 0.95, 0.9999);
    const min = Math.max(0.1, Number(this.minSpeed) || 0.1);

    return Math.max(min, base * Math.pow(decay, lvl - 1));
  }

  addKnockback(dirX, dirZ, strength = 0) {
    const x = Number(dirX);
    const z = Number(dirZ);
    const s = Number(strength);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(s) || s <= 0) return;
    const len = Math.sqrt(x * x + z * z) || 1;
    this.knockbackVel.x += (x / len) * s;
    this.knockbackVel.z += (z / len) * s;
    const max = Math.max(0, Number(this.knockbackMaxSpeed) || 0);
    const kLen = Math.sqrt(this.knockbackVel.x * this.knockbackVel.x + this.knockbackVel.z * this.knockbackVel.z) || 0;
    if (max > 0 && kLen > max) {
      const m = max / kLen;
      this.knockbackVel.x *= m;
      this.knockbackVel.z *= m;
    }
  }

  applyExplosion(dirX, dirZ, { speed = 10, stunSec = 1 } = {}) {
    const s = Number(speed);
    const t = Number(stunSec);
    if (Number.isFinite(t) && t > 0) this.stunTimer = Math.max(this.stunTimer, t);
    if (!Number.isFinite(s) || s <= 0) return;
    this.knockbackMaxSpeed = Math.max(Number(this.knockbackMaxSpeed) || 0, s);
    this.addKnockback(dirX, dirZ, s);
  }

  _spacingBetweenSizes(aSize, bSize) {
    const a = Math.max(0, Number(aSize) || 0);
    const b = Math.max(0, Number(bSize) || 0);
    const avg = (a + b) * 0.5;
    return Math.max(0.12, avg * 0.92);
  }

  clearTail() {
    if (this.tailInsertAnim?.cube?.mesh?.parent) this.tailInsertAnim.cube.mesh.parent.remove(this.tailInsertAnim.cube.mesh);
    this.tailInsertAnim = null;
    this.headTailMergeAnim = null;
    this.tailMergeAnims = [];
    this._tailMergeDelayTimer = 0;
    this.tailInsertQueue.length = 0;
    for (const seg of this.tail) {
      const mesh = seg?.mesh;
      if (mesh?.parent) mesh.parent.remove(mesh);
    }
    this.tail.length = 0;
  }

  enqueueTailValue(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    this.tailInsertQueue.push(n);
    this._headPulseTime = this._headPulseDurationSec;
  }

  _sortTailDescending() {
    if (this.tail.length < 2) return;
    this.tail.sort((a, b) => (b?.value ?? 0) - (a?.value ?? 0));
  }

  _getTailInsertIndex(value) {
    for (let i = 0; i < this.tail.length; i += 1) {
      const tailValue = this.tail[i]?.value ?? 0;
      if (tailValue < value) return i;
    }
    return this.tail.length;
  }

  _removeTailAt(index) {
    const seg = this.tail[index];
    const mesh = seg?.mesh;
    if (mesh?.parent) mesh.parent.remove(mesh);
    this.tail.splice(index, 1);
  }

  _startTailInsertAnimation(value) {
    if (!this.cubeFactory || !this.parent) return;
    const seg = this.cubeFactory.create(value, this.parent);
    seg.setName("");
    seg.mesh.position.copy(this.head.mesh.position);
    seg.mesh.position.y = seg.size / 2;
    this.tailInsertAnim = {
      cube: seg,
      value,
      elapsed: 0,
      duration: this._tailInsertAnimSec,
      targetIndex: this._getTailInsertIndex(value),
    };
  }

  _finalizeTailInsertAnimation() {
    const anim = this.tailInsertAnim;
    if (!anim?.cube) return;
    this.tail.splice(anim.targetIndex, 0, anim.cube);
    this.tailInsertAnim = null;
    this._tailMergeDelayTimer = this._tailMergeDelaySec;
  }

  _startHeadTailMergeAnimation() {
    if (this.tail.length === 0) return false;
    const first = this.tail[0];
    if (!first) return false;
    if ((first.value ?? 0) !== (this.head.value ?? 0)) return false;
    this.headTailMergeAnim = {
      fromCube: first,
      fromStartPos: first.mesh.position.clone(),
      elapsed: 0,
      duration: this._tailMergeAnimSec,
    };
    this._tailMergeDelayTimer = this._tailMergeDelaySec;
    return true;
  }

  _finalizeHeadTailMerge() {
    const anim = this.headTailMergeAnim;
    if (!anim?.fromCube) return;
    const first = this.tail[0];
    if (!first || first !== anim.fromCube) return;
    if ((first.value ?? 0) !== (this.head.value ?? 0)) return;
    this.setHeadValue((this.head.value ?? 0) * 2);
    this._removeTailAt(0);
    this._tailMergeDelayTimer = this._tailMergeDelaySec;
  }

  _findNextTailMergePairIndex() {
    for (let i = 0; i < this.tail.length - 1; i += 1) {
      const a = this.tail[i];
      const b = this.tail[i + 1];
      if (!a || !b) continue;
      if ((a.value ?? 0) === (b.value ?? 0)) return i;
    }
    return -1;
  }

  _startTailMergeAnimations(startIndex = 0) {
    const anims = [];
    for (let i = Math.max(0, startIndex); i < this.tail.length - 1; ) {
      const a = this.tail[i];
      const b = this.tail[i + 1];
      if (!a || !b) {
        i += 1;
        continue;
      }
      if ((a.value ?? 0) === (b.value ?? 0)) {
        anims.push({
          intoCube: a,
          fromCube: b,
          elapsed: 0,
          duration: this._tailMergeAnimSec,
        });
        i += 2;
      } else {
        i += 1;
      }
    }
    if (anims.length > 0) this.tailMergeAnims = anims;
    return anims.length > 0;
  }

  _finalizeTailMerges() {
    if (!Array.isArray(this.tailMergeAnims) || this.tailMergeAnims.length === 0) return;

    const removals = [];
    for (const anim of this.tailMergeAnims) {
      const into = anim?.intoCube;
      const from = anim?.fromCube;
      if (!into || !from) continue;
      const intoIdx = this.tail.indexOf(into);
      const fromIdx = this.tail.indexOf(from);
      if (intoIdx < 0 || fromIdx < 0) continue;
      if (fromIdx !== intoIdx + 1) continue;
      if ((into.value ?? 0) !== (from.value ?? 0)) continue;
      into.setValue((into.value ?? 0) * 2);
      removals.push(fromIdx);
    }

    removals.sort((a, b) => b - a);
    for (const idx of removals) this._removeTailAt(idx);

    this.tailMergeAnims = [];
    this._tailMergeDelayTimer = this._tailMergeDelaySec;
    this._sortTailDescending();
  }

  _updateTailFeedingFlow(dt) {
    if (this.tailInsertAnim) {
      const anim = this.tailInsertAnim;
      anim.elapsed += dt;
      if (anim.elapsed >= Math.max(1e-5, anim.duration)) this._finalizeTailInsertAnimation();
      return;
    }

    if (this.headTailMergeAnim || (this.tailMergeAnims && this.tailMergeAnims.length > 0)) {
      if (this.headTailMergeAnim) {
        this.headTailMergeAnim.elapsed += dt;
        if (this.headTailMergeAnim.elapsed >= Math.max(1e-5, this.headTailMergeAnim.duration)) {
          this._finalizeHeadTailMerge();
          this.headTailMergeAnim = null;
          this._sortTailDescending();
        }
      }

      if (this.tailMergeAnims && this.tailMergeAnims.length > 0) {
        let done = true;
        for (const anim of this.tailMergeAnims) {
          anim.elapsed += dt;
          if (anim.elapsed < Math.max(1e-5, anim.duration)) done = false;
        }
        if (done) this._finalizeTailMerges();
      }
      return;
    }

    if (this._tailMergeDelayTimer > 0) {
      this._tailMergeDelayTimer = Math.max(0, this._tailMergeDelayTimer - dt);
      return;
    }

    if (this.tailInsertQueue.length > 0) {
      const v = this.tailInsertQueue.shift();
      this._startTailInsertAnimation(v);
      return;
    }

    const headMergeStarted = this._startHeadTailMergeAnimation();
    const startIdx = headMergeStarted ? 1 : 0;
    const tailMergeStarted = this._startTailMergeAnimations(startIdx);
    if (headMergeStarted || tailMergeStarted) return;
  }

  _applyHeadPulse(dt) {
    if (!this.head?.mesh) return;
    if (this._headPulseTime > 0) {
      this._headPulseTime = Math.max(0, this._headPulseTime - dt);
      const k = this._headPulseDurationSec > 0 ? this._headPulseTime / this._headPulseDurationSec : 0;
      const mul = 1 + (this._headPulseMaxScale - 1) * (k * k);
      this.head.mesh.scale.setScalar(this._headBaseScale * mul);
      return;
    }
    this.head.mesh.scale.setScalar(this._headBaseScale);
  }

  _updateInsertingCubePose(dt, headPos) {
    const anim = this.tailInsertAnim;
    if (!anim?.cube?.mesh) return;
    const t = smoothstep01(anim.duration > 0 ? anim.elapsed / anim.duration : 1);
    let prevSize = this.head.size;
    let distToPrev = 0;
    for (let i = 0; i < anim.targetIndex; i += 1) {
      const seg = this.tail[i];
      if (!seg) break;
      distToPrev += this._spacingBetweenSizes(prevSize, seg.size);
      prevSize = seg.size;
    }
    const spacingToPrev = this._spacingBetweenSizes(prevSize, anim.cube.size);
    const distToTarget = distToPrev + spacingToPrev;
    const dist = distToTarget * t;
    const pos = sampleAlongTrail(this._trail, headPos, dist, this._tmpVec3);
    anim.cube.mesh.position.copy(pos);
    anim.cube.mesh.position.y = anim.cube.size / 2;

    const aheadDist = Math.max(0, dist - spacingToPrev);
    const aheadPos = sampleAlongTrail(this._trail, headPos, aheadDist, this._tmpVec3B);
    const dx = aheadPos.x - pos.x;
    const dz = aheadPos.z - pos.z;
    anim.cube.setYawTargetFromMove(dx, dz);
    anim.cube.update(dt);
  }

  _updateTailPositions(dt, headPos) {
    const insertAnim = this.tailInsertAnim;
    const mergeAnims = Array.isArray(this.tailMergeAnims) ? this.tailMergeAnims : [];
    const headMergeAnim = this.headTailMergeAnim;

    const insertT = insertAnim
      ? smoothstep01(insertAnim.duration > 0 ? insertAnim.elapsed / insertAnim.duration : 1)
      : 0;
    const insertPrevSize = insertAnim
      ? insertAnim.targetIndex === 0
        ? this.head.size
        : this.tail[insertAnim.targetIndex - 1]?.size ?? this.head.size
      : 0;
    const insertShiftDist = insertAnim ? insertT * this._spacingBetweenSizes(insertPrevSize, insertAnim.cube.size) : 0;

    const headMergeT = headMergeAnim
      ? easeInOutCubic01(headMergeAnim.duration > 0 ? headMergeAnim.elapsed / headMergeAnim.duration : 1)
      : 0;
    const headMergeShiftDist = headMergeAnim
      ? headMergeT * this._spacingBetweenSizes(this.head.size, headMergeAnim.fromCube?.size ?? 0)
      : 0;

    const mergeShifts = [];
    for (const anim of mergeAnims) {
      const fromIdx = this.tail.indexOf(anim.fromCube);
      if (fromIdx < 0) continue;
      const t = easeInOutCubic01(anim.duration > 0 ? anim.elapsed / anim.duration : 1);
      mergeShifts.push({ fromIdx, shift: t * this._spacingBetweenSizes(anim.intoCube?.size ?? 0, anim.fromCube?.size ?? 0) });
    }

    let runningDist = 0;
    for (let i = 0; i < this.tail.length; i += 1) {
      const seg = this.tail[i];
      if (!seg?.mesh) continue;

      const prevSize = i === 0 ? this.head.size : this.tail[i - 1]?.size ?? this.head.size;
      const spacing = this._spacingBetweenSizes(prevSize, seg.size);
      runningDist += spacing;

      const extraInsert = insertAnim && i >= insertAnim.targetIndex ? insertShiftDist : 0;
      let extraMerge = 0;
      for (const m of mergeShifts) {
        if (i >= m.fromIdx) extraMerge -= m.shift;
      }
      const extraHeadMerge = headMergeAnim ? -headMergeShiftDist : 0;
      const extra = extraInsert + extraMerge + extraHeadMerge;

      const segDist = Math.max(0, runningDist + extra);
      const segPos = sampleAlongTrail(this._trail, headPos, segDist, this._tmpVec3);
      seg.mesh.position.copy(segPos);
      seg.mesh.position.y = seg.size / 2;

      const aheadDist = Math.max(0, runningDist - spacing + extra);
      const aheadPos = sampleAlongTrail(this._trail, headPos, aheadDist, this._tmpVec3B);
      const dx = aheadPos.x - segPos.x;
      const dz = aheadPos.z - segPos.z;
      seg.setYawTargetFromMove(dx, dz);
      seg.update(dt);
    }
  }


  setPosition(x, y, z) {
    this.head.setPosition(x, y, z);
    for (const seg of this.tail) seg.setPosition(x, y, z);
    this._trail.length = 0;
    const p = this.head.mesh.position.clone();
    const count = this.tail.length + 32;
    for (let i = 0; i < count; i += 1) this._trail.push(p.clone());
  }

  setLookDirFromMove(dirX, dirZ) {
    this.head.setYawTargetFromMove(dirX, dirZ);
  }

  get headPosition() {
    return this.head.mesh.position;
  }

  update(dt) {
    this.head.update(dt);

    const yaw = this.head.currentYaw;
    this.headDirection.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    if (this.stunTimer > 0) this.stunTimer = Math.max(0, this.stunTimer - dt);
    const moveSpeed = this.stunTimer > 0 ? 0 : this._speedForHeadLevel(this.head.level);
    this.head.mesh.position.addScaledVector(this.headDirection, moveSpeed * dt);
    this.head.mesh.position.x += (this.knockbackVel.x || 0) * dt;
    this.head.mesh.position.z += (this.knockbackVel.z || 0) * dt;
    const damp = Math.pow(0.02, dt);
    this.knockbackVel.x *= damp;
    this.knockbackVel.z *= damp;

    const bounds = this.movementBounds;
    const halfX = bounds ? bounds.halfX : this.mapSize / 2;
    const halfZ = bounds ? bounds.halfZ : this.mapSize / 2;
    const margin = this.head.size * 0.3;
    this.head.mesh.position.x = clamp(this.head.mesh.position.x, -halfX + margin, halfX - margin);
    this.head.mesh.position.z = clamp(this.head.mesh.position.z, -halfZ + margin, halfZ - margin);
    this.head.mesh.position.y = this.head.size / 2;

    const headPos = this.head.mesh.position;
    if (this._trail.length === 0) this._trail.push(headPos.clone());

    let last = this._trail[this._trail.length - 1];
    this._tmpVec3.copy(headPos).sub(last);
    let dist = this._tmpVec3.length();
    const step = Math.max(0.06, this.pathPointMinDist || 0.22);
    while (dist >= step && dist > 1e-6) {
      this._tmpVec3.multiplyScalar(step / dist);
      last = last.clone().add(this._tmpVec3);
      this._trail.push(last);
      this._tmpVec3.copy(headPos).sub(last);
      dist = this._tmpVec3.length();
    }

    const maxTrailPoints = this.tail.length + 96;
    if (this._trail.length > maxTrailPoints) this._trail.splice(0, this._trail.length - maxTrailPoints);

    this._updateTailFeedingFlow(dt);
    this._updateInsertingCubePose(dt, headPos);
    this._updateTailPositions(dt, headPos);
    this._applyHeadPulse(dt);
  }
}
