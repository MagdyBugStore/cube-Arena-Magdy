import { CubeFactory } from "./entities/CubeFactory.js";
import { SceneEnvironment } from "./env/SceneEnvironment.js";
import { GameMap } from "./world/GameMap.js";
import { THREE } from "./vendor/three.js";

const env = new SceneEnvironment();
const mapSize = 18;
new GameMap({ parent: env.scene, size: mapSize });

const cubeFactory = new CubeFactory({ maxLevel: 21 });

const cubes = Array.from({ length: 21 }, (_, i) =>
  cubeFactory.createFromLevel(i, env.scene),
);

const cube = cubeFactory.createFromLevel(0, env.scene);
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

const lookRightWorld = new THREE.Vector3();
const lookUpWorld = new THREE.Vector3();
const lookVec = new THREE.Vector3();
const clickNdc = new THREE.Vector2();
const clickRaycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clickPoint = new THREE.Vector3();
let lastMoveKey = "";

env.addUpdatable({
  update(dt) {
    const right = pressed.has("ArrowRight") || pressed.has("KeyD");
    const left = pressed.has("ArrowLeft") || pressed.has("KeyA");
    const down = pressed.has("ArrowDown") || pressed.has("KeyS");
    const up = pressed.has("ArrowUp") || pressed.has("KeyW");

    const inputRight = (right ? 1 : 0) - (left ? 1 : 0);
    const inputUp = (up ? 1 : 0) - (down ? 1 : 0);
    if (inputRight === 0 && inputUp === 0) return;

    lookRightWorld
      .set(1, 0, 0)
      .applyQuaternion(env.camera.quaternion)
      .setY(0)
      .normalize();

    lookUpWorld
      .set(0, 1, 0)
      .applyQuaternion(env.camera.quaternion)
      .setY(0)
      .normalize();

    lookVec
      .copy(lookRightWorld)
      .multiplyScalar(inputRight)
      .addScaledVector(lookUpWorld, inputUp);

    const len = lookVec.length() || 1;
    const lookX = lookVec.x / len;
    const lookZ = lookVec.z / len;
    cube.setYawTargetFromMove(lookX, lookZ);

  },
});

env.renderer.domElement.addEventListener("pointermove", (e) => {
  const lookingWithKeys =
    pressed.has("ArrowRight") ||
    pressed.has("KeyD") ||
    pressed.has("ArrowLeft") ||
    pressed.has("KeyA") ||
    pressed.has("ArrowDown") ||
    pressed.has("KeyS") ||
    pressed.has("ArrowUp") ||
    pressed.has("KeyW");
  if (lookingWithKeys) return;

  const rect = env.renderer.domElement.getBoundingClientRect();
  clickNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  clickNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  clickRaycaster.setFromCamera(clickNdc, env.camera);
  const hit = clickRaycaster.ray.intersectPlane(groundPlane, clickPoint);
  if (!hit) return;

  const half = mapSize / 2;
  const x = Math.max(-half, Math.min(half, clickPoint.x));
  const z = Math.max(-half, Math.min(half, clickPoint.z));

  const dx = x - cube.mesh.position.x;
  const dz = z - cube.mesh.position.z;
  cube.setYawTargetFromMove(dx, dz);
});

env.renderer.domElement.addEventListener("click", (e) => {
  const rect = env.renderer.domElement.getBoundingClientRect();
  clickNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  clickNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

  clickRaycaster.setFromCamera(clickNdc, env.camera);
  const hit = clickRaycaster.ray.intersectPlane(groundPlane, clickPoint);
  if (!hit) return;

  const half = mapSize / 2;
  const x = Math.max(-half, Math.min(half, clickPoint.x));
  const z = Math.max(-half, Math.min(half, clickPoint.z));

  const marker = cubeFactory.create(1, env.scene);
  marker.setPosition(x, marker.size / 2, z);
  env.addUpdatable(marker);

  console.log({ click: { x, y: 0, z } });

  const dx = x - cube.mesh.position.x;
  const dz = z - cube.mesh.position.z;
  cube.setYawTargetFromMove(dx, dz);
});

env.start();
