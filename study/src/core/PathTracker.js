import * as THREE from 'three';

function catmullRomValue(t, p0, p1, p2, p3) {
  const v0 = (p2 - p0) * 0.5;
  const v1 = (p3 - p1) * 0.5;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * p1 - 2 * p2 + v0 + v1) * t3 +
    (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 +
    v0 * t +
    p1
  );
}

export class PathTracker {
  constructor(cfg) {
    this.cfg = cfg;
    this.points = [];
    this.totalDist = 0;
    this.lastSamplePos = new THREE.Vector3();
    this.hasLastSample = false;
  }

  reset(initialPos) {
    this.totalDist = 0;
    this.points.length = 0;
    this.points.push({ x: initialPos.x, y: initialPos.y, z: initialPos.z, dist: 0 });
    this.lastSamplePos.copy(initialPos);
    this.hasLastSample = true;
  }

  record(pos, segmentCount) {
    if (!this.hasLastSample) {
      this.reset(pos);
      return;
    }

    const dx = pos.x - this.lastSamplePos.x;
    const dz = pos.z - this.lastSamplePos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < this.cfg.pathPointMinDist) return;

    this.totalDist += d;
    this.points.push({ x: pos.x, y: pos.y, z: pos.z, dist: this.totalDist });
    this.lastSamplePos.copy(pos);

    // With size-aware tail spacing, required distance can exceed the old estimate.
    // Keep more history so getPoint() can still sample the correct region.
    const maxDistNeeded =
      segmentCount * this.cfg.tailSegmentLength * 3 + this.cfg.pathHistoryBufferDistance;
    const minDist = this.totalDist - maxDistNeeded;
    while (this.points.length > 2 && this.points[0].dist < minDist) this.points.shift();
  }

  getPoint(cumDist, fallbackPos, outVec3) {
    const pts = this.points;
    if (!pts || pts.length === 0) {
      outVec3.set(fallbackPos.x, fallbackPos.y, fallbackPos.z);
      return outVec3;
    }

    if (pts.length === 1) {
      outVec3.set(pts[0].x, pts[0].y, pts[0].z);
      return outVec3;
    }

    if (cumDist <= pts[0].dist) {
      outVec3.set(pts[0].x, pts[0].y, pts[0].z);
      return outVec3;
    }

    const last = pts[pts.length - 1];
    if (cumDist >= last.dist) {
      outVec3.set(last.x, last.y, last.z);
      return outVec3;
    }

    let lo = 0;
    let hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].dist <= cumDist) lo = mid;
      else hi = mid;
    }

    const p0 = pts[Math.max(0, lo - 1)];
    const p1 = pts[lo];
    const p2 = pts[hi];
    const p3 = pts[Math.min(pts.length - 1, hi + 1)];
    const span = p2.dist - p1.dist;
    const t = span > 0 ? (cumDist - p1.dist) / span : 0;

    // Catmull-Rom interpolation for smooth snake-like body curvature.
    const tx = catmullRomValue(t, p0.x, p1.x, p2.x, p3.x);
    const tz = catmullRomValue(t, p0.z, p1.z, p2.z, p3.z);
    outVec3.set(tx, this.cfg.cubeSize / 2, tz);
    return outVec3;
  }
}
