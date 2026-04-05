import { Cube } from "./Cube.js";

export class CubeFactory {
  constructor({ maxLevel = 21 } = {}) {
    this.maxLevel = maxLevel;
    this.baseSize = 0.4;
    this.sizeStep = 0.02;
    this.palette = [
      "#FF6B6B",
      "#FFD166",
      "#06D6A0",
      "#4ECDC4",
      "#6C63FF",
      "#F78C6B",
      "#9B5DE5",
      "#00BBF9",
    ];
  }

  colorForValue(value) {
    const n = Math.max(1, Number(value) || 1);
    const exp = Math.max(0, Math.floor(Math.log2(n)));
    return this.palette[exp % this.palette.length];
  }

  getFromLevel(level) {
    const lvl = Math.max(0, Math.min(this.maxLevel, Math.floor(Number(level) || 0)));
    return {
      level: lvl,
      value: 2 ** lvl,
      size: this.baseSize + this.sizeStep * lvl,
      color: this.colorForValue(2 ** lvl),
    };
  }

  get(value) {
    const n = Math.max(1, Number(value) || 1);
    const lvl = Math.max(0, Math.min(this.maxLevel, Math.floor(Math.log2(n))));
    return { level: lvl, value: n, size: this.baseSize + this.sizeStep * lvl, color: this.colorForValue(n) };
  }

  createFromLevel(level, parent) {
    const spec = this.getFromLevel(level);
    const cube = new Cube({ parent, value: spec.value, size: spec.size, color: spec.color });
    cube.level = spec.level;
    cube._maxLevel = this.maxLevel;
    cube._baseSize = this.baseSize;
    cube._sizeStep = this.sizeStep;
    cube._palette = this.palette;
    return cube;
  }

  create(value, parent) {
    const spec = this.get(value);
    const cube = new Cube({ parent, value: spec.value, size: spec.size, color: spec.color });
    cube.level = spec.level;
    cube._maxLevel = this.maxLevel;
    cube._baseSize = this.baseSize;
    cube._sizeStep = this.sizeStep;
    cube._palette = this.palette;
    return cube;
  }
}
