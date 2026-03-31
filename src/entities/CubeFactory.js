import { Cube } from "./Cube.js";

export class CubeFactory {
  constructor({ maxLevel = 21 } = {}) {
    this.maxLevel = maxLevel;
    this.baseSize = 0.4;
    this.sizeStep = 0.02;
  }

  getFromLevel(level) {
    const lvl = Math.max(0, Math.min(this.maxLevel, Math.floor(Number(level) || 0)));
    return {
      level: lvl,
      value: 2 ** lvl,
      size: this.baseSize + this.sizeStep * lvl,
    };
  }

  get(value) {
    const n = Math.max(1, Number(value) || 1);
    const lvl = Math.max(0, Math.min(this.maxLevel, Math.floor(Math.log2(n))));
    return { level: lvl, value: n, size: this.baseSize + this.sizeStep * lvl };
  }

  createFromLevel(level, parent) {
    const spec = this.getFromLevel(level);
    const cube = new Cube({ parent, value: spec.value, size: spec.size });
    cube.level = spec.level;
    return cube;
  }

  create(value, parent) {
    const spec = this.get(value);
    const cube = new Cube({ parent, value: spec.value, size: spec.size });
    cube.level = spec.level;
    return cube;
  }
}
