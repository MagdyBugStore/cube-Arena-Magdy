import { Cube } from "./entities/Cube.js";
import { SceneEnvironment } from "./env/SceneEnvironment.js";
import { GameMap } from "./world/GameMap.js";
import { THREE } from "./vendor/three.js";

const env = new SceneEnvironment();
const mapSize = 18;
new GameMap({ parent: env.scene, size: mapSize });

const cubeFactory = {
  baseSize: 0.4,
  sizeStep: 0.02,
  get(level) {
    const i = level - 1;
    return { level, value: 2 ** level, size: this.baseSize + this.sizeStep * i };
  },
  create(level, parent) {
    const spec = this.get(level);
    const cube = new Cube({ parent, value: spec.value, size: spec.size });
    cube.level = spec.level;
    return cube;
  },
};

const cubes = Array.from({ length: 20 }, (_, i) =>
  cubeFactory.create(i + 1, env.scene),
);

const cube = new Cube({ parent: env.scene, value: 1 });
cube.setPosition(0, cube.size / 2, 1);

const sizesSum = cubes.reduce((sum, c) => sum + c.size, 0);
const baseGap = 0.02;
const maxRowWidth = mapSize;
const gap =
  cubes.length > 1
    ? Math.max(0, Math.min(baseGap, (maxRowWidth - sizesSum) / (cubes.length - 1)))
    : 0;
const rowWidth = sizesSum + gap * Math.max(0, cubes.length - 1);
let x = -rowWidth / 2;
const rightDir = new THREE.Vector3(1, 0, 0)
  .applyQuaternion(env.camera.quaternion)
  .setY(0)
  .normalize();
for (const c of cubes) {
  x += c.size / 2;
  c.setPosition(rightDir.x * x, c.size / 2, rightDir.z * x);
  x += c.size / 2 + gap;
}

cubes.forEach((cube) => {
  env.addUpdatable(cube);
});

env.addUpdatable(cube);

const pressed = new Set();
addEventListener("keydown", (e) => {
  if (e.code.startsWith("Arrow")) e.preventDefault();
  pressed.add(e.code);
});
addEventListener("keyup", (e) => {
  if (e.code.startsWith("Arrow")) e.preventDefault();
  pressed.delete(e.code);
});

env.addUpdatable({
  update(dt) {
    const right = pressed.has("ArrowRight") || pressed.has("KeyD");
    const left = pressed.has("ArrowLeft") || pressed.has("KeyA");
    const down = pressed.has("ArrowDown") || pressed.has("KeyS");
    const up = pressed.has("ArrowUp") || pressed.has("KeyW");

    const dirX = (right ? 1 : 0) - (left ? 1 : 0);
    const dirZ = (down ? 1 : 0) - (up ? 1 : 0);
    if (dirX === 0 && dirZ === 0) return;

    const len = Math.hypot(dirX, dirZ) || 1;
    const speed = 4;
    cube.mesh.position.x += (dirX / len) * speed * dt;
    cube.mesh.position.z += (dirZ / len) * speed * dt;

    const half = mapSize / 2 - cube.size / 2;
    cube.mesh.position.x = Math.max(
      -half,
      Math.min(half, cube.mesh.position.x),
    );
    cube.mesh.position.z = Math.max(
      -half,
      Math.min(half, cube.mesh.position.z),
    );
  },
});

addEventListener("pointermove", (e) => {
  cube.setYawTargetFromPointer(e.clientX, e.clientY, innerWidth, innerHeight);
});

env.start();
