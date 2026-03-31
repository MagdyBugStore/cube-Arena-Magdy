import { CubeFactory } from "./entities/CubeFactory.js";
import { Player } from "./entities/Player.js";
import { SceneEnvironment } from "./env/SceneEnvironment.js";
import { GameMap } from "./world/GameMap.js";
import { THREE } from "./vendor/three.js";

const env = new SceneEnvironment();
const mapSize = 18;
new GameMap({ parent: env.scene, size: mapSize });
const keyLight = env.scene.children.find((obj) => obj?.isDirectionalLight && obj.castShadow);
const keyLightTarget = keyLight?.target ?? new THREE.Object3D();
if (keyLight) env.scene.add(keyLightTarget);
const keyLightOffset = keyLight
  ? new THREE.Vector3().subVectors(keyLight.position, keyLightTarget.position)
  : undefined;
const setShadowArea =
  typeof env.setShadowArea === "function"
    ? (size) => env.setShadowArea(size)
    : (size) => {
        if (!keyLight) return;
        const half = Math.max(6, size / 2 + 1);
        keyLight.shadow.camera.left = -half;
        keyLight.shadow.camera.right = half;
        keyLight.shadow.camera.top = half;
        keyLight.shadow.camera.bottom = -half;
        keyLight.shadow.camera.updateProjectionMatrix();
      };
const setShadowCenter =
  typeof env.setShadowCenter === "function"
    ? (x, z) => env.setShadowCenter(x, z)
    : (x, z) => {
        if (!keyLight || !keyLightOffset) return;
        keyLightTarget.position.set(x, 0, z);
        keyLight.position.copy(keyLightTarget.position).add(keyLightOffset);
        keyLightTarget.updateMatrixWorld();
      };
setShadowArea(mapSize);

const cubeFactory = new CubeFactory({ maxLevel: 21 });

const cubes = Array.from({ length: 21 }, (_, i) =>
  cubeFactory.createFromLevel(i, env.scene),
);

const player = new Player({ cubeFactory, parent: env.scene, mapSize, name: "You", speed: 2.6, tailLength: 8 });
player.setPosition(0, player.head.size / 2, 1);
const cameraFollowOffset = new THREE.Vector3().subVectors(env.camera.position, player.head.mesh.position);

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

env.addUpdatable(player);

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
    player.setLookDirFromMove(lookX, lookZ);

  },
});

env.addUpdatable({
  update() {
    env.camera.position.copy(player.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(player.head.mesh.position.x, 0, player.head.mesh.position.z);
    setShadowCenter(player.head.mesh.position.x, player.head.mesh.position.z);
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

  const dx = x - player.head.mesh.position.x;
  const dz = z - player.head.mesh.position.z;
  player.setLookDirFromMove(dx, dz);
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

  const dx = x - player.head.mesh.position.x;
  const dz = z - player.head.mesh.position.z;
  player.setLookDirFromMove(dx, dz);
});

env.start();
