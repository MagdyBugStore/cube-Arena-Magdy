import { THREE } from "../vendor/three.js";

export class FreeCubeSpawner {
  constructor({
    cubeFactory,
    parent,
    mapSize = 18,
    values = [1, 2, 4, 8, 16],
    maxCount = 80,
    spawnIntervalMinSec = 0.35,
    spawnIntervalMaxSec = 1.1,
    spawnHeightMin = 8,
    spawnHeightMax = 14,
    fallSpeed = 6.5,
  } = {}) {
    this.cubeFactory = cubeFactory;
    this.parent = parent;
    this.mapSize = mapSize;
    this.values = values;
    this.maxCount = maxCount;
    this.spawnIntervalMinSec = spawnIntervalMinSec;
    this.spawnIntervalMaxSec = spawnIntervalMaxSec;
    this.spawnHeightMin = spawnHeightMin;
    this.spawnHeightMax = spawnHeightMax;
    this.fallSpeed = fallSpeed;
    this.cubes = [];
    this._timerSec = 0;
    this._resetTimer();
  }

  _randomBetween(min, max) {
    return THREE.MathUtils.lerp(min, max, Math.random());
  }

  _resetTimer() {
    this._timerSec = this._randomBetween(this.spawnIntervalMinSec, this.spawnIntervalMaxSec);
  }

  _pickRandomValue() {
    return this.values[(Math.random() * this.values.length) | 0];
  }

  _boundsForSize(size) {
    const half = this.mapSize / 2;
    const margin = size / 2;
    return {
      minX: -half + margin,
      maxX: half - margin,
      minZ: -half + margin,
      maxZ: half - margin,
    };
  }

  spawnScatter({
    value = 1,
    x = 0,
    z = 0,
    radius = 0.8,
    heightMin = 0.7,
    heightMax = 2.2,
    impulseMin = 1.2,
    impulseMax = 4.2,
    upMin = 2.8,
    upMax = 7.8,
  } = {}) {
    if (!this.cubeFactory || !this.parent) return;
    if (this.cubes.length >= this.maxCount) return;

    const cube = this.cubeFactory.create(value, this.parent);
    cube.setName("");
    cube.mesh.rotation.y = Math.random() * Math.PI * 2;

    const bounds = this._boundsForSize(cube.size);
    const angle = Math.random() * Math.PI * 2;
    const r = this._randomBetween(0, radius);
    const px = THREE.MathUtils.clamp(x + Math.cos(angle) * r, bounds.minX, bounds.maxX);
    const pz = THREE.MathUtils.clamp(z + Math.sin(angle) * r, bounds.minZ, bounds.maxZ);
    cube.mesh.position.set(px, this._randomBetween(heightMin, heightMax) + cube.size / 2, pz);

    const impulse = this._randomBetween(impulseMin, impulseMax);
    const dirAngle = angle + this._randomBetween(-0.8, 0.8);
    const vx = Math.cos(dirAngle) * impulse;
    const vz = Math.sin(dirAngle) * impulse;
    const vy = this._randomBetween(upMin, upMax);
    const gravity = this.fallSpeed * this._randomBetween(1.2, 2.4);
    this.cubes.push({ cube, fallSpeed: this.fallSpeed, vx, vy, vz, gravity });
  }

  spawnOne() {
    if (!this.cubeFactory || !this.parent) return;
    if (this.cubes.length >= this.maxCount) return;

    const value = this._pickRandomValue();
    const cube = this.cubeFactory.create(value, this.parent);
    cube.setName("");
    cube.mesh.rotation.y = Math.random() * Math.PI * 2;

    const bounds = this._boundsForSize(cube.size);
    cube.mesh.position.set(
      this._randomBetween(bounds.minX, bounds.maxX),
      this._randomBetween(this.spawnHeightMin, this.spawnHeightMax),
      this._randomBetween(bounds.minZ, bounds.maxZ)
    );

    const speed = this.fallSpeed * this._randomBetween(0.85, 1.2);
    this.cubes.push({ cube, fallSpeed: speed });
  }

  removeAt(index) {
    const entry = this.cubes[index];
    if (!entry) return;
    const mesh = entry.cube?.mesh;
    if (mesh?.parent) mesh.parent.remove(mesh);
    this.cubes.splice(index, 1);
  }

  update(dt) {
    this._timerSec -= dt;
    if (this._timerSec <= 0) {
      this.spawnOne();
      this._resetTimer();
    }

    for (const entry of this.cubes) {
      const cube = entry.cube;
      if (!cube?.mesh) continue;
      const minY = cube.size / 2;

      if (typeof entry.vy === "number" && typeof entry.vx === "number" && typeof entry.vz === "number") {
        const g = typeof entry.gravity === "number" ? entry.gravity : this.fallSpeed * 12;
        entry.vy -= g * dt;
        cube.mesh.position.x += entry.vx * dt;
        cube.mesh.position.y += entry.vy * dt;
        cube.mesh.position.z += entry.vz * dt;

        entry.vx *= Math.pow(0.12, dt);
        entry.vz *= Math.pow(0.12, dt);

        const bounds = this._boundsForSize(cube.size);
        if (cube.mesh.position.x < bounds.minX) {
          cube.mesh.position.x = bounds.minX;
          entry.vx *= -0.55;
        } else if (cube.mesh.position.x > bounds.maxX) {
          cube.mesh.position.x = bounds.maxX;
          entry.vx *= -0.55;
        }
        if (cube.mesh.position.z < bounds.minZ) {
          cube.mesh.position.z = bounds.minZ;
          entry.vz *= -0.55;
        } else if (cube.mesh.position.z > bounds.maxZ) {
          cube.mesh.position.z = bounds.maxZ;
          entry.vz *= -0.55;
        }

        if (cube.mesh.position.y < minY) {
          cube.mesh.position.y = minY;
          entry.vy = Math.abs(entry.vy) * 0.18;
          if (Math.abs(entry.vy) < 0.25) entry.vy = 0;
        }
        continue;
      }

      cube.mesh.position.y -= entry.fallSpeed * dt;
      if (cube.mesh.position.y < minY) cube.mesh.position.y = minY;
    }
  }
}
