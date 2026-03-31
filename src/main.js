import { CubeFactory } from "./entities/CubeFactory.js";
import { Player } from "./entities/Player.js";
import { SceneEnvironment } from "./env/SceneEnvironment.js";
import { FreeCubeSpawner } from "./systems/FreeCubeSpawner.js";
import { GameMap } from "./world/GameMap.js";
import { THREE } from "./vendor/three.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randomBetween(min, max) {
  return THREE.MathUtils.lerp(min, max, Math.random());
}

function pickWeightedIndex(weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) sum += weights[i];
  if (!(sum > 0)) return 0;
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

const statsByPlayer = new Map();
function getPlayerName(p) {
  const n = p?.head?.name ?? "";
  return n ? String(n) : "Player";
}
function getStats(p) {
  let s = statsByPlayer.get(p);
  if (s) return s;
  s = { score: 0, kills: 0, lastHeadValue: p?.head?.value ?? 0 };
  statsByPlayer.set(p, s);
  return s;
}

const env = new SceneEnvironment();
const mapSize = 32;
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

const freeCubeSpawner = new FreeCubeSpawner({
  cubeFactory,
  parent: env.scene,
  mapSize,
  maxCount: Math.min(520, Math.round(mapSize * mapSize * 0.4)),
  spawnHeightMin: 6,
  spawnHeightMax: 12,
  fallSpeed: 8.5,
});
env.addUpdatable(freeCubeSpawner);

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

function chooseSpawnXZ({ mapSize, radius, avoid = [], avoidDist = 5.5, tries = 60 } = {}) {
  const half = mapSize / 2;
  const margin = radius;
  const minX = -half + margin;
  const maxX = half - margin;
  const minZ = -half + margin;
  const maxZ = half - margin;
  const avoidDistSq = avoidDist * avoidDist;

  for (let i = 0; i < tries; i += 1) {
    const x = randomBetween(minX, maxX);
    const z = randomBetween(minZ, maxZ);
    let ok = true;
    for (const p of avoid) {
      const pos = p?.head?.mesh?.position;
      if (!pos) continue;
      const dx = pos.x - x;
      const dz = pos.z - z;
      if (dx * dx + dz * dz < avoidDistSq) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, z };
  }

  return { x: randomBetween(minX, maxX), z: randomBetween(minZ, maxZ) };
}

function scatterTailOnDeath(victim) {
  if (!victim?.head?.mesh) return;
  if (!freeCubeSpawner || typeof freeCubeSpawner.spawnScatter !== "function") return;

  const center = victim.head.mesh.position;
  const values = [];
  const insertValue = victim.tailInsertAnim?.value ?? victim.tailInsertAnim?.cube?.value;
  if (Number.isFinite(insertValue) && insertValue > 0) values.push(insertValue);
  if (Array.isArray(victim.tail)) {
    for (const seg of victim.tail) {
      const v = seg?.value ?? 0;
      if (v > 0) values.push(v);
    }
  }
  if (values.length === 0) return;

  const maxAdd = Math.max(0, (freeCubeSpawner.maxCount ?? 0) - (freeCubeSpawner.cubes?.length ?? 0));
  const count = Math.min(values.length, maxAdd, 28);
  if (count <= 0) return;

  const radius = 1.1 + (victim.head.size ?? 0) * 2.6;
  for (let i = 0; i < count; i += 1) {
    const idx = (Math.random() * values.length) | 0;
    const v = values[idx];
    freeCubeSpawner.spawnScatter({
      value: v,
      x: center.x,
      z: center.z,
      radius,
      impulseMin: 1.6,
      impulseMax: 5.0,
      upMin: 3.2,
      upMax: 8.8,
    });
  }
}

function respawnPlayer(p, { avoid = [] } = {}) {
  const spawnValue = p.spawnHeadValue ?? 2;
  p.setHeadValue(spawnValue);
  p.clearTail();
  const s = statsByPlayer.get(p);
  if (s) {
    s.score = 0;
    s.kills = 0;
    s.lastHeadValue = spawnValue;
  }
  const { x, z } = chooseSpawnXZ({
    mapSize,
    radius: p.head.size / 2,
    avoid,
    avoidDist: 6.5 + p.head.size * 4,
  });
  p.setPosition(x, p.head.size / 2, z);
  p.setLookDirFromMove(Math.random() - 0.5, Math.random() - 0.5);
}

function spawnInFrontOfPlayer(p, forwardX, forwardZ, { distMin = 8, distMax = 14, spread = 6 } = {}) {
  const half = mapSize / 2;
  const margin = p.head.size / 2;
  const dist = randomBetween(distMin, distMax);
  const perpX = -forwardZ;
  const perpZ = forwardX;
  const lateral = randomBetween(-spread, spread);
  const x = clamp(p.head.mesh.position.x + forwardX * dist + perpX * lateral, -half + margin, half - margin);
  const z = clamp(p.head.mesh.position.z + forwardZ * dist + perpZ * lateral, -half + margin, half - margin);
  p.setPosition(x, p.head.size / 2, z);
  p.setLookDirFromMove(-forwardX, -forwardZ);
}

const baseSpeedAt2 = 2.6;
const player = new Player({ cubeFactory, parent: env.scene, mapSize, name: "You", speed: baseSpeedAt2, tailLength: 0, headLevel: 1 });
player.spawnHeadValue = player.head.value ?? 2;
player.setPosition(0, player.head.size / 2, 1);
const defaultCameraFollowOffset = new THREE.Vector3().subVectors(env.camera.position, player.head.mesh.position);
const cameraFollowOffset = defaultCameraFollowOffset.clone();
let playerJoined = false;

getStats(player);

const hudBoard = document.getElementById("hudBoard");
const hudRows = [];
if (hudBoard) {
  for (let i = 0; i < 5; i += 1) {
    const row = document.createElement("div");
    row.className = "row";
    const rank = document.createElement("span");
    rank.className = "rank";
    const name = document.createElement("span");
    name.className = "name";
    const score = document.createElement("span");
    score.className = "score";
    row.append(rank, name, score);
    hudBoard.append(row);
    hudRows.push({ rank, name, score });
  }
}

const bots = [];
const players = [];
const botCount = 50;

function randomHeadLevel() {
  const weights = [];
  for (let lvl = 1; lvl <= 16; lvl += 1) weights.push(Math.pow(0.78, lvl - 1));
  const idx = pickWeightedIndex(weights);
  if (Math.random() < 0.06) return 17 + ((Math.random() * 5) | 0);
  return 1 + idx;
}

function randomTailLength() {
  const weights = [1.2, 1.1, 1.0, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45];
  return pickWeightedIndex(weights);
}

for (let i = 0; i < botCount; i += 1) {
  const headLevel = randomHeadLevel();
  const tailLength = randomTailLength();
  const bot = new Player({
    cubeFactory,
    parent: env.scene,
    mapSize,
    name: `PC ${String(i + 1).padStart(2, "0")}`,
    speed: baseSpeedAt2,
    tailLength,
    headLevel,
    tailLevel: 0,
  });
  bot.spawnHeadValue = bot.head.value ?? 2;
  getStats(bot);
  bot.ai = {
    timer: randomBetween(0.05, 0.35),
    mode: "wander",
    target: { x: 0, z: 0 },
    decisionMinSec: randomBetween(0.06, 0.22),
    decisionMaxSec: randomBetween(0.18, 0.75),
    aggressiveness: Math.random(),
    greed: Math.random(),
    caution: Math.random(),
    noise: randomBetween(0.1, 0.9),
    jitter: randomBetween(0.03, 0.22),
  };
  bots.push(bot);
  players.push(bot);
  respawnPlayer(bot, { avoid: players.filter((p) => p !== bot) });
}

env.addUpdatable({
  update(dt) {
    if (!playerJoined) return;
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

function decideBot(bot, brain) {
  const botPos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const botSize = bot.head.size ?? 0;

  let threat = null;
  let threatDist = Infinity;
  const threatValueThreshold = botValue * (1.12 + brain.caution * 0.35);
  for (const other of players) {
    if (!other || other === bot) continue;
    const otherValue = other.head.value ?? 0;
    if (otherValue <= threatValueThreshold) continue;
    const pos = other.head.mesh.position;
    const dx = pos.x - botPos.x;
    const dz = pos.z - botPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < threatDist) {
      threatDist = d;
      threat = other;
    }
  }

  let prey = null;
  let preyDist = Infinity;
  const preyValueThreshold = botValue * (0.82 - brain.aggressiveness * 0.14);
  for (const other of players) {
    if (!other || other === bot) continue;
    const otherValue = other.head.value ?? 0;
    if (otherValue <= 0 || otherValue >= preyValueThreshold) continue;
    const pos = other.head.mesh.position;
    const dx = pos.x - botPos.x;
    const dz = pos.z - botPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < preyDist) {
      preyDist = d;
      prey = other;
    }
  }

  let bestCube = null;
  let bestCubeScore = -Infinity;
  const cubes = freeCubeSpawner.cubes;
  if (cubes.length > 0) {
    const samples = Math.min(26, cubes.length);
    for (let i = 0; i < samples; i += 1) {
      const entry = cubes[(Math.random() * cubes.length) | 0];
      const cube = entry?.cube;
      if (!cube?.mesh) continue;
      const v = cube.value ?? 0;
      if (v <= 0 || v > botValue) continue;
      const dx = cube.mesh.position.x - botPos.x;
      const dz = cube.mesh.position.z - botPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const desirability = Math.pow(v, 0.65 + brain.greed * 0.75) / Math.pow(d + 0.4, 1.25);
      const score = desirability + (Math.random() - 0.5) * brain.noise * 0.05;
      if (score > bestCubeScore) {
        bestCubeScore = score;
        bestCube = cube;
      }
    }
  }

  const escapeDist = 4 + botSize * (10 + brain.caution * 8);
  const escapeUrgency = threat ? clamp((escapeDist - threatDist) / escapeDist, 0, 1) : 0;

  const huntDist = 8 + botSize * 10;
  const huntUrgency = prey ? clamp((huntDist - preyDist) / huntDist, 0, 1) : 0;

  const collectUrgency = bestCube ? clamp(bestCubeScore * 0.6, 0, 1) : 0;

  const opts = [];
  const weights = [];

  if (threat) {
    const w = 0.35 + escapeUrgency * (1.4 + brain.caution * 0.9);
    opts.push({ mode: "escape", threat });
    weights.push(w);
  }
  if (prey) {
    const w = 0.12 + huntUrgency * (0.8 + brain.aggressiveness * 1.2) * (1 - escapeUrgency * 0.85);
    opts.push({ mode: "hunt", prey });
    weights.push(w);
  }
  if (bestCube) {
    const w = 0.18 + collectUrgency * (0.9 + brain.greed * 1.6) * (1 - escapeUrgency * 0.9);
    opts.push({ mode: "collect", cube: bestCube });
    weights.push(w);
  }

  opts.push({ mode: "wander" });
  weights.push(0.12 + Math.random() * 0.25 + (1 - escapeUrgency) * 0.15);

  const idx = pickWeightedIndex(weights);
  const chosen = opts[idx];
  brain.mode = chosen.mode;
  if (chosen.mode === "escape" && chosen.threat) {
    const pos = chosen.threat.head.mesh.position;
    brain.target.x = botPos.x - (pos.x - botPos.x);
    brain.target.z = botPos.z - (pos.z - botPos.z);
    return;
  }
  if (chosen.mode === "hunt" && chosen.prey) {
    const pos = chosen.prey.head.mesh.position;
    brain.target.x = pos.x;
    brain.target.z = pos.z;
    return;
  }
  if (chosen.mode === "collect" && chosen.cube?.mesh) {
    brain.target.x = chosen.cube.mesh.position.x;
    brain.target.z = chosen.cube.mesh.position.z;
    return;
  }

  const { x, z } = chooseSpawnXZ({
    mapSize,
    radius: botSize / 2,
    avoid: [],
    avoidDist: 0,
    tries: 1,
  });
  brain.target.x = x;
  brain.target.z = z;
}

function steerBot(bot, brain) {
  const pos = bot.head.mesh.position;
  const dx = brain.target.x - pos.x;
  const dz = brain.target.z - pos.z;
  let vx = dx;
  let vz = dz;

  const half = mapSize / 2;
  const safe = 1.6 + bot.head.size * 1.5;
  if (pos.x > half - safe) vx -= (pos.x - (half - safe)) * 4;
  if (pos.x < -half + safe) vx += (-half + safe - pos.x) * 4;
  if (pos.z > half - safe) vz -= (pos.z - (half - safe)) * 4;
  if (pos.z < -half + safe) vz += (-half + safe - pos.z) * 4;

  const jitter = brain.jitter * (0.35 + Math.random() * 0.65);
  const px = -vz;
  const pz = vx;
  vx += px * (Math.random() - 0.5) * jitter;
  vz += pz * (Math.random() - 0.5) * jitter;

  const len = Math.sqrt(vx * vx + vz * vz) || 1;
  bot.setLookDirFromMove(vx / len, vz / len);
}

env.addUpdatable({
  update(dt) {
    for (const bot of bots) {
      const brain = bot.ai;
      if (!brain) continue;
      brain.timer -= dt;
      if (brain.timer <= 0) {
        decideBot(bot, brain);
        brain.timer = randomBetween(brain.decisionMinSec, brain.decisionMaxSec);
      }
      steerBot(bot, brain);
    }
  },
});

for (const bot of bots) env.addUpdatable(bot);

function resolvePlayerVsFreeCubes(p) {
  const headPos = p.head.mesh.position;
  const headSize = p.head.size;
  const headValue = p.head.value ?? 0;
  for (let i = freeCubeSpawner.cubes.length - 1; i >= 0; i -= 1) {
    const entry = freeCubeSpawner.cubes[i];
    const cube = entry?.cube;
    if (!cube?.mesh) continue;

    const dx = cube.mesh.position.x - headPos.x;
    const dy = cube.mesh.position.y - headPos.y;
    const dz = cube.mesh.position.z - headPos.z;
    const r = (headSize + cube.size) / 2;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) continue;

    const cubeValue = cube.value ?? 0;
    if (cubeValue > headValue) {
      const xzMax = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (xzMax <= 1e-6) continue;

      const dxz2 = dx * dx + dz * dz;
      const distXZ = Math.sqrt(Math.max(dxz2, 1e-8));
      const penetration = xzMax - distXZ + 0.01;
      if (penetration <= 0) continue;

      let nx = -dx / distXZ;
      let nz = -dz / distXZ;
      if (!Number.isFinite(nx) || !Number.isFinite(nz) || dxz2 < 1e-8) {
        const dir = p.headDirection;
        const l = Math.sqrt((dir?.x ?? 0) ** 2 + (dir?.z ?? 0) ** 2) || 1;
        nx = (dir?.x ?? 0) / l;
        nz = (dir?.z ?? 0) / l;
      }

      const half = mapSize / 2;
      const margin = headSize / 2;
      headPos.x = clamp(headPos.x + nx * penetration, -half + margin, half - margin);
      headPos.z = clamp(headPos.z + nz * penetration, -half + margin, half - margin);
      headPos.y = headSize / 2;
      p.setLookDirFromMove(nx, nz);
      continue;
    }

    freeCubeSpawner.removeAt(i);
    p.enqueueTailValue(cubeValue);
    getStats(p).score += cubeValue;
  }
}

const tmpPush = new THREE.Vector3();
env.addUpdatable({
  update() {
    for (const p of players) resolvePlayerVsFreeCubes(p);

    for (const eater of players) {
      if (!eater?.head?.mesh) continue;
      const eaterPos = eater.head.mesh.position;
      const eaterValue = eater.head.value ?? 0;
      const eaterSize = eater.head.size ?? 0;
      let eatenThisFrame = 0;

      for (let iter = 0; iter < 2; iter += 1) {
        for (const owner of players) {
          if (!owner || owner === eater) continue;
          if (!Array.isArray(owner.tail) || owner.tail.length === 0) continue;

          for (let segIndex = owner.tail.length - 1; segIndex >= 0; segIndex -= 1) {
            const seg = owner.tail[segIndex];
            if (!seg?.mesh) continue;

            const dx = eaterPos.x - seg.mesh.position.x;
            const dz = eaterPos.z - seg.mesh.position.z;
            const r = eaterSize / 2 + (seg.size ?? 0) / 2 + 0.01;
            const d2xz = dx * dx + dz * dz;
            if (d2xz >= r * r) continue;

            const segValue = seg.value ?? 0;
            if (segValue <= eaterValue) {
              if (typeof owner._removeTailAt === "function") owner._removeTailAt(segIndex);
              else {
                const mesh = seg.mesh;
                if (mesh?.parent) mesh.parent.remove(mesh);
                owner.tail.splice(segIndex, 1);
              }
              eater.enqueueTailValue(segValue);
              getStats(eater).score += Math.max(0, segValue);
              eatenThisFrame += 1;
              if (eatenThisFrame >= 2) break;
              continue;
            }

            const dist = Math.sqrt(Math.max(1e-8, d2xz));
            const penetration = r - dist + 0.02;
            if (penetration <= 0) continue;

            let nx = dx / dist;
            let nz = dz / dist;
            if (!Number.isFinite(nx) || !Number.isFinite(nz) || d2xz < 1e-8) {
              const dir = eater.headDirection;
              const l = Math.sqrt((dir?.x ?? 0) ** 2 + (dir?.z ?? 0) ** 2) || 1;
              nx = (dir?.x ?? 0) / l;
              nz = (dir?.z ?? 0) / l;
            }

            const half = mapSize / 2;
            const margin = eaterSize / 2;
            eaterPos.x = clamp(eaterPos.x + nx * penetration, -half + margin, half - margin);
            eaterPos.z = clamp(eaterPos.z + nz * penetration, -half + margin, half - margin);
            eaterPos.y = eaterSize / 2;
            eater.setLookDirFromMove(nx, nz);
          }

          if (eatenThisFrame >= 2) break;
        }

        if (eatenThisFrame >= 2) break;
      }
    }

    for (let i = 0; i < players.length; i += 1) {
      const a = players[i];
      if (!a?.head?.mesh) continue;
      for (let j = i + 1; j < players.length; j += 1) {
        const b = players[j];
        if (!b?.head?.mesh) continue;

        const aPos = a.head.mesh.position;
        const bPos = b.head.mesh.position;
        const dx = bPos.x - aPos.x;
        const dz = bPos.z - aPos.z;
        const r = (a.head.size + b.head.size) / 2;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-10) continue;

        const aValue = a.head.value ?? 0;
        const bValue = b.head.value ?? 0;
        if (aValue !== bValue) {
          const eater = aValue > bValue ? a : b;
          const victim = eater === a ? b : a;
          const victimValue = victim.head.value ?? 0;
          eater.enqueueTailValue(victimValue);
          const eaterStats = getStats(eater);
          eaterStats.kills += 1;
          eaterStats.score += Math.max(0, victimValue) * 2;
          scatterTailOnDeath(victim);
          respawnPlayer(victim, { avoid: players.filter((p) => p !== victim) });
          continue;
        }

        const dist = Math.sqrt(d2) || 1;
        const penetration = r - dist + 0.02;
        const nx = dx / dist;
        const nz = dz / dist;
        tmpPush.set(nx, 0, nz).multiplyScalar(penetration * 0.5);

        const half = mapSize / 2;
        const aMargin = a.head.size / 2;
        const bMargin = b.head.size / 2;
        aPos.x = clamp(aPos.x - tmpPush.x, -half + aMargin, half - aMargin);
        aPos.z = clamp(aPos.z - tmpPush.z, -half + aMargin, half - aMargin);
        bPos.x = clamp(bPos.x + tmpPush.x, -half + bMargin, half - bMargin);
        bPos.z = clamp(bPos.z + tmpPush.z, -half + bMargin, half - bMargin);
      }
    }
  },
});

env.addUpdatable({
  update(dt) {
    for (const p of players) {
      const s = getStats(p);
      const v = p.head.value ?? 0;
      if (v > s.lastHeadValue) s.score += v - s.lastHeadValue;
      s.lastHeadValue = v;
    }

    if (hudRows.length === 0) return;

    const board = players
      .map((p) => ({ p }))
      .sort((a, b) => (b.p.head.value ?? 0) - (a.p.head.value ?? 0))
      .slice(0, 5);

    for (let i = 0; i < hudRows.length; i += 1) {
      const row = hudRows[i];
      const entry = board[i];
      if (!entry) {
        row.rank.textContent = "";
        row.name.textContent = "";
        row.score.textContent = "";
        continue;
      }
      row.rank.textContent = String(i + 1);
      row.name.textContent = getPlayerName(entry.p);
      row.score.textContent = String(entry.p.head.value ?? 0);
    }
  },
});

env.addUpdatable({
  update() {
    if (!playerJoined) return;
    env.camera.position.copy(player.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(player.head.mesh.position.x, 0, player.head.mesh.position.z);
    setShadowCenter(player.head.mesh.position.x, player.head.mesh.position.z);
  },
});

env.renderer.domElement.addEventListener("pointermove", (e) => {
  if (!playerJoined) return;

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
  if (!playerJoined) return;
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

const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");
let started = false;

function startGame() {
  if (started) return;
  started = true;
  if (startOverlay) startOverlay.style.display = "none";
  if (!playerJoined) {
    respawnPlayer(player, { avoid: players });
    players.unshift(player);
    env.addUpdatable(player);
    cameraFollowOffset.copy(defaultCameraFollowOffset);
    env.camera.position.copy(player.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(player.head.mesh.position.x, 0, player.head.mesh.position.z);
    playerJoined = true;
  }
}

if (startButton) startButton.addEventListener("click", startGame);
if (startOverlay) startOverlay.addEventListener("pointerdown", (e) => {
  if (e.target === startOverlay) startGame();
});
addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") startGame();
});

env.start();
