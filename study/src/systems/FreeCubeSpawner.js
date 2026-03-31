import * as THREE from 'three';
import { CubeEntity } from '../entities/CubeEntity.js';

export class FreeCubeSpawner {
  constructor(options) {
    this.cfg = options.cfg;
    this.scene = options.scene;
    this.createNumberedCube = options.createNumberedCube;
    this.cubeSizeForValue = options.cubeSizeForValue;
    this.getGroundBounds = options.getGroundBounds;
    this.getCubes = options.getCubes;
    this.setCubes = options.setCubes;
    this.spawnTimerSec = 0;
    this.values = [1, 2, 4, 8, 16];
    this.resetSpawnTimer();
  }

  randomBetween(min, max) {
    return THREE.MathUtils.lerp(min, max, Math.random());
  }

  pickRandomValue() {
    return this.values[(Math.random() * this.values.length) | 0];
  }

  resetSpawnTimer() {
    this.spawnTimerSec = this.randomBetween(
      this.cfg.freeCubeSpawnIntervalMinSec,
      this.cfg.freeCubeSpawnIntervalMaxSec
    );
  }

  spawnOne() {
    const cubes = this.getCubes();
    if (cubes.length >= this.cfg.freeCubeMaxCount) return;

    const bounds = this.getGroundBounds();
    const value = this.pickRandomValue();
    const size = this.cubeSizeForValue(value);
    const mesh = this.createNumberedCube(value, size);
    mesh.position.set(
      this.randomBetween(bounds.minX, bounds.maxX),
      this.randomBetween(this.cfg.freeCubeSpawnHeightMin, this.cfg.freeCubeSpawnHeightMax),
      this.randomBetween(bounds.minZ, bounds.maxZ)
    );

    const fallSpeed =
      this.cfg.freeCubeFallSpeed * this.randomBetween(0.85, 1.2);
    const freeCube = new CubeEntity(mesh, CubeEntity.TYPES.FREE, value, size, { fallSpeed });
    freeCube.updateBox();

    this.scene.add(mesh);
    cubes.push(mesh);
  }

  seed(count) {
    for (let i = 0; i < count; i++) this.spawnOne();
  }

  update(dt) {
    this.spawnTimerSec -= dt;
    if (this.spawnTimerSec <= 0) {
      this.spawnOne();
      this.resetSpawnTimer();
    }

    const cubes = this.getCubes();
    for (const mesh of cubes) {
      if (!mesh || !mesh.userData || !mesh.userData.entity) continue;
      const entity = mesh.userData.entity;
      if (entity.type !== CubeEntity.TYPES.FREE) continue;
      entity.updateFall(dt);
      entity.updateBox();
    }
  }

  clear() {
    const cubes = this.getCubes();
    for (const mesh of cubes) this.scene.remove(mesh);
    this.setCubes([]);
  }
}
