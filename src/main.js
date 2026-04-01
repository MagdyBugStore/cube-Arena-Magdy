import { CubeFactory } from "./entities/CubeFactory.js";
import { Player } from "./entities/Player.js";
import { SceneEnvironment } from "./env/SceneEnvironment.js";
import { FreeCubeSpawner } from "./systems/FreeCubeSpawner.js";
import { GameMap } from "./world/GameMap.js";
import { THREE } from "./vendor/three.js";
import { createSparkManager } from "./render/sparks.js";
import { EXPLOSION } from "./config/explosion.js";

const URL_PARAMS = new URLSearchParams(globalThis.location?.search ?? "");
const TEST_MODE = URL_PARAMS.get("test") === "1" || URL_PARAMS.get("test") === "true";
const TEST_BOT_COUNT = TEST_MODE ? 1 : Math.max(0, Number(URL_PARAMS.get("bots") ?? 50) || 0);
const TEST_LOG = URL_PARAMS.get("log") === "1" || URL_PARAMS.get("log") === "true" || TEST_MODE;
const BOT_OBJECTIVE_RAW = String(URL_PARAMS.get("objective") ?? URL_PARAMS.get("ai") ?? "");
const BOT_OBJECTIVE = BOT_OBJECTIVE_RAW.trim().toLowerCase();
const BOT_KILL_ALL = URL_PARAMS.has("killall")
  ? URL_PARAMS.get("killall") === "1" || URL_PARAMS.get("killall") === "true"
  : BOT_OBJECTIVE === ""
    ? true
    : BOT_OBJECTIVE === "killall" || BOT_OBJECTIVE === "kill";
const LLM_MODE = String(URL_PARAMS.get("llm") ?? "").trim().toLowerCase();
const LLM_BOT_INDEX = Math.max(0, Number(URL_PARAMS.get("llmbot") ?? 0) || 0);
const MINIMAP_ENABLED = URL_PARAMS.has("minimap")
  ? URL_PARAMS.get("minimap") === "1" || URL_PARAMS.get("minimap") === "true"
  : true;

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

function clamp01(v) {
  return clamp(v, 0, 1);
}

function pickWeighted(weights) {
  return pickWeightedIndex(weights);
}

function randomSign() {
  return Math.random() < 0.5 ? -1 : 1;
}

function jitter01(amount) {
  return clamp01((Math.random() - 0.5) * amount);
}

function makePersonality() {
  const presets = [
    {
      name: "Balanced",
      w: 1.25,
      t: {
        aggressiveness: 0.45,
        greed: 0.55,
        caution: 0.52,
        stubbornness: 0.48,
        curiosity: 0.45,
        patience: 0.55,
        impulsiveness: 0.35,
        defensiveness: 0.55,
        opportunism: 0.5,
        reactionSpeed: 0.6,
        attention: 0.6,
        focus: 0.5,
        discipline: 0.55,
      },
    },
    {
      name: "Cautious",
      w: 1.05,
      t: {
        aggressiveness: 0.25,
        greed: 0.45,
        caution: 0.82,
        stubbornness: 0.55,
        curiosity: 0.35,
        patience: 0.72,
        impulsiveness: 0.22,
        defensiveness: 0.7,
        opportunism: 0.35,
        reactionSpeed: 0.55,
        attention: 0.75,
        focus: 0.45,
        discipline: 0.7,
      },
    },
    {
      name: "Greedy",
      w: 1.0,
      t: {
        aggressiveness: 0.35,
        greed: 0.88,
        caution: 0.45,
        stubbornness: 0.42,
        curiosity: 0.4,
        patience: 0.4,
        impulsiveness: 0.55,
        defensiveness: 0.45,
        opportunism: 0.7,
        reactionSpeed: 0.6,
        attention: 0.55,
        focus: 0.62,
        discipline: 0.45,
      },
    },
    {
      name: "Bully",
      w: 0.95,
      t: {
        aggressiveness: 0.88,
        greed: 0.55,
        caution: 0.3,
        stubbornness: 0.55,
        curiosity: 0.35,
        patience: 0.4,
        impulsiveness: 0.7,
        defensiveness: 0.6,
        opportunism: 0.72,
        reactionSpeed: 0.65,
        attention: 0.45,
        focus: 0.7,
        discipline: 0.35,
      },
    },
    {
      name: "Explorer",
      w: 0.9,
      t: {
        aggressiveness: 0.32,
        greed: 0.45,
        caution: 0.5,
        stubbornness: 0.35,
        curiosity: 0.9,
        patience: 0.55,
        impulsiveness: 0.35,
        defensiveness: 0.4,
        opportunism: 0.4,
        reactionSpeed: 0.55,
        attention: 0.55,
        focus: 0.4,
        discipline: 0.5,
      },
    },
    {
      name: "Opportunist",
      w: 0.9,
      t: {
        aggressiveness: 0.6,
        greed: 0.7,
        caution: 0.4,
        stubbornness: 0.32,
        curiosity: 0.4,
        patience: 0.35,
        impulsiveness: 0.72,
        defensiveness: 0.45,
        opportunism: 0.9,
        reactionSpeed: 0.72,
        attention: 0.55,
        focus: 0.65,
        discipline: 0.35,
      },
    },
    {
      name: "Terminator",
      w: 0.2,
      t: {
        aggressiveness: 0.95,
        greed: 0.5,
        caution: 0.38,
        stubbornness: 0.75,
        curiosity: 0.25,
        patience: 0.55,
        impulsiveness: 0.28,
        defensiveness: 0.45,
        opportunism: 0.92,
        reactionSpeed: 0.75,
        attention: 0.6,
        focus: 0.82,
        discipline: 0.72,
      },
    },
  ];
  const weights = presets.map((p) => p.w);
  const chosen = BOT_KILL_ALL ? presets.find((x) => x.name === "Terminator") ?? presets[0] : presets[pickWeighted(weights)];
  const base = chosen.t;
  const j = 0.22;
  const mix = (x) => clamp01(x + (Math.random() - 0.5) * j);
  const p = {
    preset: chosen.name,
    aggressiveness: mix(base.aggressiveness),
    greed: mix(base.greed),
    caution: mix(base.caution),
    stubbornness: mix(base.stubbornness),
    curiosity: mix(base.curiosity),
    patience: mix(base.patience),
    impulsiveness: mix(base.impulsiveness),
    defensiveness: mix(base.defensiveness),
    opportunism: mix(base.opportunism),
    reactionSpeed: mix(base.reactionSpeed),
    attention: mix(base.attention),
    focus: mix(base.focus),
    discipline: mix(base.discipline),
  };
  p.impulsiveness = clamp01(p.impulsiveness * (1 - p.discipline * 0.55));
  return p;
}

function createBrain() {
  const personality = makePersonality();
  const minThinkIntervalSec = THREE.MathUtils.lerp(0.16, 0.55, personality.patience) * THREE.MathUtils.lerp(0.9, 0.7, personality.reactionSpeed);
  const reactionDelaySec = THREE.MathUtils.lerp(0.55, 0.08, personality.reactionSpeed);
  const focusSwitchDelaySec = THREE.MathUtils.lerp(0.08, 0.55, personality.discipline) * THREE.MathUtils.lerp(1.0, 0.55, personality.impulsiveness);
  const commitBaseSec = THREE.MathUtils.lerp(0.35, 2.35, personality.stubbornness) * THREE.MathUtils.lerp(0.75, 1.25, personality.patience);
  return {
    personality,
    objective: BOT_KILL_ALL ? "killAll" : "normal",
    llmMode: LLM_MODE || "off",
    llmNextAtSec: 0,
    plan: null,
    pendingInterrupt: null,
    nextThinkAtSec: 0,
    lastThinkAtMs: 0,
    minThinkIntervalSec,
    reactionDelaySec,
    focusSwitchDelaySec,
    commitBaseSec,
    steerX: 0,
    steerZ: -1,
    wanderPhase: randomBetween(0, Math.PI * 2),
    wanderTurnSpeed: randomBetween(0.55, 1.9),
    noiseValue: 0,
    decisionCounter: 0,
    _dbgLastDecisionAtMs: 0,
    _dbgLastPlanKey: "",
  };
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
if (env.renderer?.domElement) {
  env.renderer.domElement.style.touchAction = "none";
  env.renderer.domElement.style.userSelect = "none";
  env.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
}
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

const sparks = createSparkManager(env.scene);
env.addUpdatable(sparks);

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

const MATCH_DURATION_SEC = 3600;

function removeTailAt(owner, index) {
  if (!owner || typeof index !== "number") return;
  if (typeof owner._removeTailAt === "function") {
    owner._removeTailAt(index);
    return;
  }
  const seg = owner.tail?.[index];
  const mesh = seg?.mesh;
  if (mesh?.parent) mesh.parent.remove(mesh);
  if (Array.isArray(owner.tail)) owner.tail.splice(index, 1);
}

function eliminateFromMatch(victim, killer) {
  if (!victim) return;

  const idx = players.indexOf(victim);
  if (idx >= 0) players.splice(idx, 1);
  if (env.updatables?.delete) env.updatables.delete(victim);

  dropTailFromIndex(victim, 0);
  if (typeof victim.clearTail === "function") victim.clearTail();
  if (victim.head?.mesh) victim.head.mesh.visible = false;

  victim.eliminated = true;

  if (victim === player) {
    playerJoined = false;
    spectatorFocus = killer ?? null;
    pressed.clear();
  }

  renderAliveCounter();

  if (!matchActive) return;
  if (players.length !== 1) return;
  const winner = players[0];
  endMatch({ winner, reasonText: "آخر لاعب" });
}

function addKillNotification(killer, victim) {
  if (!matchActive || !matchTotalPlayers) return;
  const killerName = getPlayerName(killer);
  const victimName = getPlayerName(victim);
  const nowSec = performance.now() * 0.001;
  killFeed.unshift({ text: `${killerName} قتل ${victimName}`, expiresAtSec: nowSec + 4.5 });
  if (killFeed.length > 6) killFeed.length = 6;
  renderKillFeed();
}

function renderKillFeed() {
  if (!killFeedEl) return;
  killFeedEl.replaceChildren(
    ...killFeed.map((entry) => {
      const div = document.createElement("div");
      div.className = "killItem";
      div.textContent = entry.text;
      return div;
    })
  );
}

function renderAliveCounter() {
  const target = hudMatchInfoEl ?? aliveCounterEl;
  if (!target) return;
  if (!matchTotalPlayers) {
    target.textContent = "";
    return;
  }
  if (matchActive && matchEndAtSec > 0) {
    const nowSec = performance.now() * 0.001;
    const left = Math.max(0, matchEndAtSec - nowSec);
    target.textContent = `المتبقي: ${players.length} / ${matchTotalPlayers} — الوقت: ${formatTimeMMSS(left)}`;
    return;
  }
  target.textContent = `المتبقي: ${players.length} / ${matchTotalPlayers}`;
}

function formatTimeMMSS(totalSec) {
  const t = Math.max(0, Math.floor(Number(totalSec) || 0));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function computeWinnerByValue(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  let best = list[0];
  let bestV = best?.head?.value ?? -Infinity;
  for (let i = 1; i < list.length; i += 1) {
    const p = list[i];
    const v = p?.head?.value ?? -Infinity;
    if (v > bestV) {
      best = p;
      bestV = v;
    }
  }
  return best;
}

function clearEndLeaderboard() {
  if (!endLeaderboardEl) return;
  endLeaderboardEl.replaceChildren();
}

function getLeaderboardEntries() {
  const all = [player, ...bots];
  return all
    .filter((p) => p?.head)
    .map((p) => {
      const s = getStats(p);
      return {
        p,
        name: getPlayerName(p),
        value: p.head.value ?? 0,
        kills: s?.kills ?? 0,
        score: s?.score ?? 0,
        eliminated: Boolean(p.eliminated),
      };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (b.kills ?? 0) - (a.kills ?? 0) || (b.score ?? 0) - (a.score ?? 0));
}

function renderEndLeaderboard(winner) {
  if (!endLeaderboardEl) return;
  if (!matchTotalPlayers) {
    clearEndLeaderboard();
    return;
  }

  const entries = getLeaderboardEntries();
  const title = document.createElement("div");
  title.className = "lbTitle";
  title.textContent = "لائحة الصدارة";

  const rows = entries.slice(0, 10).map((e, idx) => {
    const row = document.createElement("div");
    row.className = "lbRow";

    const left = document.createElement("div");
    left.className = "lbLeft";
    const winMark = e.p === winner ? " (الفائز)" : "";
    const outMark = e.eliminated ? " (خرج)" : "";
    left.textContent = `${idx + 1}) ${e.name}${winMark}${outMark}`;

    const right = document.createElement("div");
    right.className = "lbRight";
    right.textContent = `${e.value} • قتلات: ${e.kills}`;

    row.append(left, right);
    return row;
  });

  endLeaderboardEl.replaceChildren(title, ...rows);
}

function endMatch({ winner, reasonText = "" } = {}) {
  if (!winner || !matchActive) return;
  matchActive = false;
  matchEndAtSec = 0;

  spectatorFocus = winner ?? null;
  playerJoined = false;
  pressed.clear();
  if (env.updatables?.delete) env.updatables.delete(player);
  setPaused(true);
  showEndOverlay({ winner, reasonText });
}

function endMatchByTime() {
  if (!matchActive) return;
  const winner = computeWinnerByValue(players);
  if (!winner) return;
  endMatch({ winner, reasonText: "انتهى الوقت" });
}

function clearAllFreeCubes() {
  if (!freeCubeSpawner?.cubes || typeof freeCubeSpawner.removeAt !== "function") return;
  for (let i = freeCubeSpawner.cubes.length - 1; i >= 0; i -= 1) freeCubeSpawner.removeAt(i);
}

function resetMatchWorld() {
  matchActive = true;
  spectatorFocus = null;
  matchTotalPlayers = bots.length + 1;
  killFeed.length = 0;
  matchEndAtSec = performance.now() * 0.001 + MATCH_DURATION_SEC;

  players.length = 0;
  for (const bot of bots) {
    bot.eliminated = false;
    if (bot.head?.mesh) bot.head.mesh.visible = true;
    respawnPlayer(bot, { avoid: players });
    env.addUpdatable(bot);
    players.push(bot);
  }

  const pIdx = players.indexOf(player);
  if (pIdx >= 0) players.splice(pIdx, 1);
  if (env.updatables?.delete) env.updatables.delete(player);
  if (typeof player.clearTail === "function") player.clearTail();
  if (player.head?.mesh) player.head.mesh.visible = false;
  player.eliminated = false;
  playerJoined = false;
  pressed.clear();

  clearAllFreeCubes();
  renderAliveCounter();
  renderKillFeed();
  clearEndLeaderboard();
}

function dropSegmentAsFreeCube(seg) {
  if (!seg?.mesh) return;
  const v = seg.value ?? 0;
  if (!(v > 0)) return;
  if (typeof freeCubeSpawner.spawnAt !== "function") return;
  freeCubeSpawner.spawnAt({ value: v, x: seg.mesh.position.x, z: seg.mesh.position.z });
}

function dropTailFromIndex(owner, startIndex) {
  if (!owner || !Array.isArray(owner.tail) || owner.tail.length === 0) return;
  const from = Math.max(0, startIndex | 0);
  for (let i = owner.tail.length - 1; i >= from; i -= 1) {
    const seg = owner.tail[i];
    dropSegmentAsFreeCube(seg);
    removeTailAt(owner, i);
  }
}

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
let pointerLookActive = false;
let pointerLookId = -1;

function updateLookFromClientXY(clientX, clientY) {
  if (!playerJoined) return;
  const rect = env.renderer.domElement.getBoundingClientRect();
  clickNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  clickNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

  clickRaycaster.setFromCamera(clickNdc, env.camera);
  const hit = clickRaycaster.ray.intersectPlane(groundPlane, clickPoint);
  if (!hit) return;

  const half = mapSize / 2;
  const margin = (player?.head?.size ?? 0) * 0.3;
  const x = clamp(clickPoint.x, -half + margin, half - margin);
  const z = clamp(clickPoint.z, -half + margin, half - margin);

  const dx = x - player.head.mesh.position.x;
  const dz = z - player.head.mesh.position.z;
  player.setLookDirFromMove(dx, dz);
}

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

function placePlayer(p, { avoid = [] } = {}) {
  const { x, z } = chooseSpawnXZ({
    mapSize,
    radius: p.head.size / 2,
    avoid,
    avoidDist: 6.5 + p.head.size * 4,
  });
  p.setPosition(x, p.head.size / 2, z);
  p.setLookDirFromMove(Math.random() - 0.5, Math.random() - 0.5);
}

function respawnPlayer(p, { avoid = [] } = {}) {
  const spawnValue = 2;
  p.setHeadValue(spawnValue);
  p.clearTail();
  const s = statsByPlayer.get(p);
  if (s) {
    s.score = 0;
    s.kills = 0;
    s.lastHeadValue = spawnValue;
  }
  placePlayer(p, { avoid });
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
player.setPosition(0, player.head.size / 2, 1);
if (player.head?.mesh) player.head.mesh.visible = false;
const defaultCameraPos = env.camera.position.clone();
const defaultCameraFollowOffset = new THREE.Vector3().subVectors(env.camera.position, player.head.mesh.position);
const cameraFollowOffset = defaultCameraFollowOffset.clone();
let playerJoined = false;
let spectatorFocus = null;
let matchActive = false;
let matchTotalPlayers = 0;
let matchEndAtSec = 0;
const killFeed = [];

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

function createMiniMap() {
  if (!MINIMAP_ENABLED) return null;
  const hudEl = document.getElementById("hud");
  const miniHudEl = document.getElementById("minimapHud");
  const hostEl = miniHudEl ?? hudEl;
  if (!hostEl) return null;

  const isSmall = matchMedia?.("(max-width: 600px)")?.matches ?? innerWidth <= 600;
  const wrap = document.createElement("div");
  wrap.className = "minimap";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.gap = "6px";

  const title = document.createElement("div");
  title.textContent = "الخريطة";
  title.style.fontWeight = "900";
  title.style.opacity = "0.9";
  title.style.userSelect = "none";
  title.style.cursor = "pointer";

  const canvas = document.createElement("canvas");
  const size = isSmall ? 120 : 180;
  canvas.className = "minimapCanvas";
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.style.borderRadius = "12px";
  canvas.style.background = "rgba(0, 0, 0, 0.18)";
  canvas.style.border = "1px solid rgba(255, 255, 255, 0.12)";

  let collapsed = Boolean(isSmall);
  const applyCollapsed = () => {
    canvas.style.display = collapsed ? "none" : "block";
    wrap.style.gap = collapsed ? "0px" : "6px";
  };
  applyCollapsed();
  title.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      collapsed = !collapsed;
      applyCollapsed();
    },
    { passive: false },
  );

  wrap.append(title, canvas);
  hostEl.append(wrap);

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;

  return { canvas, ctx, size, pad: 0.0, nextDrawAtSec: 0 };
}

function drawMiniMap(m, nowSec) {
  if (!m) return;
  if (nowSec < (m.nextDrawAtSec ?? 0)) return;
  m.nextDrawAtSec = nowSec + 1 / 15;

  const ctx = m.ctx;
  const size = m.size;
  const half = mapSize / 2;
  const span = Math.max(1e-6, mapSize);
  const edgePad = 0.5;
  const usable = size - edgePad * 2;
  const toMini = (x, z) => {
    const u = clamp01((x + half) / span);
    const v = clamp01((z + half) / span);
    return { x: edgePad + u * usable, y: edgePad + (1 - v) * usable };
  };

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "rgba(6, 12, 22, 0.65)";
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

  const cubes = freeCubeSpawner?.cubes;
  if (Array.isArray(cubes) && cubes.length > 0) {
    const samples = Math.min(120, cubes.length);
    ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
    for (let i = 0; i < samples; i += 1) {
      const entry = cubes[(Math.random() * cubes.length) | 0];
      const c = entry?.cube;
      const p = c?.mesh?.position;
      if (!p) continue;
      const mp = toMini(p.x, p.z);
      ctx.fillRect(mp.x, mp.y, 2, 2);
    }
  }

  const list = Array.isArray(players) ? players : [];
  for (const p of list) {
    if (!p?.head?.mesh) continue;
    if (p.eliminated) continue;
    const pos = p.head.mesh.position;
    const v = Math.max(1, p.head.value ?? 1);
    const r = clamp(2 + Math.log2(v) * 0.35, 2, 7.5);
    const mp = toMini(pos.x, pos.z);
    const isYou = p === player && playerJoined;
    ctx.fillStyle = isYou ? "rgba(120, 190, 255, 0.95)" : "rgba(255, 120, 120, 0.85)";
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, r, 0, Math.PI * 2);
    ctx.fill();

    const dir = p.headDirection;
    if (dir) {
      const dl = Math.sqrt((dir.x ?? 0) * (dir.x ?? 0) + (dir.z ?? 0) * (dir.z ?? 0)) || 1;
      const dx = (dir.x ?? 0) / dl;
      const dz = (dir.z ?? 0) / dl;
      const tip = toMini(pos.x + dx * 1.25, pos.z + dz * 1.25);
      ctx.strokeStyle = isYou ? "rgba(120, 190, 255, 0.8)" : "rgba(255, 120, 120, 0.65)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mp.x, mp.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }
  }
}

const miniMap = createMiniMap();
if (miniMap) {
  env.addUpdatable({
    update(dt, t) {
      const nowSec = (Number.isFinite(t) ? t : performance.now()) * 0.001;
      drawMiniMap(miniMap, nowSec);
    },
  });
}

const bots = [];
const players = [];
const botCount = TEST_BOT_COUNT;
let testCamMode = TEST_MODE ? "bot" : "off";
let testCamFocus = 0;

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
  const headLevel = 1;
  const tailLength = 0;
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
  getStats(bot);
  bot.ai = createBrain();
  bots.push(bot);
  players.push(bot);
  placePlayer(bot, { avoid: players.filter((p) => p !== bot) });
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

function isBotTracked(bot) {
  if (!TEST_MODE || !TEST_LOG) return false;
  return bots[0] === bot;
}

function isLLMBot(bot) {
  if (!bot) return false;
  if (!Array.isArray(bots) || bots.length === 0) return false;
  const idx = clamp(LLM_BOT_INDEX | 0, 0, bots.length - 1);
  return bots[idx] === bot;
}

function planKey(plan) {
  if (!plan) return "";
  return `${plan.type}|${plan.targetKind ?? ""}|${plan.targetId ?? ""}`;
}

function setPlan(brain, nowSec, nextPlan) {
  const p = brain.personality;
  const commitSec = Math.max(0.12, brain.commitBaseSec * THREE.MathUtils.lerp(0.75, 1.35, p.stubbornness));
  const focusCostSec = Math.max(0, brain.focusSwitchDelaySec * THREE.MathUtils.lerp(1.0, 0.55, p.impulsiveness));
  const plan = {
    type: nextPlan.type,
    targetKind: nextPlan.targetKind ?? null,
    targetId: nextPlan.targetId ?? null,
    targetOwnerId: nextPlan.targetOwnerId ?? null,
    x: Number(nextPlan.x) || 0,
    z: Number(nextPlan.z) || 0,
    createdAtSec: nowSec,
    commitUntilSec: nowSec + commitSec,
    reason: String(nextPlan.reason ?? ""),
    lastDist: Infinity,
    stuckSec: 0,
  };
  brain.plan = plan;
  brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + focusCostSec);
}

function shouldMiss(brain, category, load01) {
  const p = brain.personality;
  const attention = clamp01(p.attention);
  const focus = clamp01(p.focus);
  const base = (1 - attention) * 0.35 + load01 * 0.35;
  const extra =
    category === "threat"
      ? focus * 0.22
      : category === "opportunity"
        ? focus * 0.12
        : 0;
  const prob = clamp01(base + extra);
  return Math.random() < prob;
}

function computePlanLoad01(planType) {
  if (planType === "hunt") return 0.62;
  if (planType === "harvestTail") return 0.5;
  if (planType === "defendTail") return 0.52;
  if (planType === "escape") return 0.55;
  if (planType === "collect") return 0.35;
  return 0.28;
}

function visionRadiusFor(brain) {
  const p = brain.personality;
  const base = THREE.MathUtils.lerp(9.5, 22, clamp01(p.attention));
  const focusPenalty = THREE.MathUtils.lerp(1.0, 0.82, clamp01(p.focus));
  return base * focusPenalty;
}

function fovCosFor(brain, category) {
  const p = brain.personality;
  const baseDeg = THREE.MathUtils.lerp(165, 85, clamp01(p.focus));
  const extra = category === "threat" ? THREE.MathUtils.lerp(10, 55, clamp01(p.attention)) : 0;
  const deg = clamp(THREE.MathUtils.lerp(baseDeg, baseDeg + extra, 1), 60, 220);
  return Math.cos((deg * Math.PI) / 180 / 2);
}

function isVisible(bot, brain, dx, dz, dist, category) {
  const r = visionRadiusFor(brain);
  if (dist > r) return false;
  if (dist < 1.2) return true;
  const dir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
  const invD = 1 / Math.max(1e-6, dist);
  const tx = dx * invD;
  const tz = dz * invD;
  const dot = (dir.x ?? 0) * tx + (dir.z ?? 0) * tz;
  const cos = fovCosFor(brain, category);
  return dot >= cos;
}

function clampTargetToArena(bot, planType, x, z) {
  const half = mapSize / 2;
  const size = bot?.head?.size ?? 0;
  const edgeMargin = size * 0.3;
  if (planType === "hunt") {
    return { x: clamp(x, -half + edgeMargin, half - edgeMargin), z: clamp(z, -half + edgeMargin, half - edgeMargin) };
  }

  const margin = size / 2 + 0.2;
  const extra =
    planType === "escape"
      ? 1.1 + size * 0.65
      : planType === "collect" || planType === "harvestTail"
        ? 0.35 + size * 0.25
        : 0.7 + size * 0.35;
  const m = margin + extra;
  return { x: clamp(x, -half + m, half - m), z: clamp(z, -half + m, half - m) };
}

function computeThreat(bot, brain) {
  const botPos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const botSize = bot.head.size ?? 0;
  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);
  if (shouldMiss(brain, "threat", load01)) return null;
  let threat = null;
  let threatDist = Infinity;
  const threatValueThreshold = botValue * (1.12 + brain.personality.caution * 0.35);
  for (const other of players) {
    if (!other || other === bot) continue;
    const otherValue = other.head.value ?? 0;
    if (otherValue <= threatValueThreshold) continue;
    const pos = other.head.mesh.position;
    const dx = pos.x - botPos.x;
    const dz = pos.z - botPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!isVisible(bot, brain, dx, dz, d, "threat")) continue;
    if (d < threatDist) {
      threatDist = d;
      threat = other;
    }
  }
  if (!threat) return null;
  const dangerDist = 3.8 + botSize * (7.5 + brain.personality.caution * 8);
  const level = clamp01((dangerDist - threatDist) / Math.max(1e-6, dangerDist));
  return { threat, threatDist, level };
}

function findBestFreeCube(bot, brain) {
  const botPos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);
  if (shouldMiss(brain, "opportunity", load01)) return null;
  const cubes = freeCubeSpawner.cubes;
  if (!Array.isArray(cubes) || cubes.length === 0) return null;
  const selfLog = Math.log2(Math.max(2, botValue));
  const big = clamp01((selfLog - 8) / 8);
  const ignore = THREE.MathUtils.lerp(0.0025, 0.02, big) * THREE.MathUtils.lerp(1.15, 0.75, brain.personality.curiosity);
  let best = null;
  let bestScore = -Infinity;
  let bestDist = Infinity;
  const samples = Math.min(32, cubes.length);
  for (let i = 0; i < samples; i += 1) {
    const entry = cubes[(Math.random() * cubes.length) | 0];
    const cube = entry?.cube;
    if (!cube?.mesh) continue;
    const v = cube.value ?? 0;
    if (v <= 0 || v > botValue) continue;
    const marginal = v / Math.max(1, botValue);
    if (marginal < ignore) continue;
    const dx = cube.mesh.position.x - botPos.x;
    const dz = cube.mesh.position.z - botPos.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 0;
    if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
    const invD = 1 / Math.max(1e-6, d);
    const tx = dx * invD;
    const tz = dz * invD;
    const dot = (botDir.x ?? 0) * tx + (botDir.z ?? 0) * tz;
    const front = clamp01((dot + 1) * 0.5);
    const frontMul = THREE.MathUtils.lerp(0.72, 1.2, front);
    const desirability =
      (Math.pow(marginal, 0.65 + brain.personality.greed * 0.55) * frontMul) / Math.pow(d + 0.45, 1.15);
    const score = desirability + brain.noiseValue * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = cube;
      bestDist = d;
    }
  }
  if (!best) return null;
  return { cube: best, score: bestScore, dist: bestDist, value: best.value ?? 0, id: best.mesh.uuid };
}

function findBestTailToHarvest(bot, brain) {
  const botPos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);
  if (shouldMiss(brain, "opportunity", load01)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const owner of players) {
    if (!owner || owner === bot) continue;
    const ownerValue = owner.head.value ?? 0;
    const tail = owner.tail;
    if (!Array.isArray(tail) || tail.length === 0) continue;
    const idxA = tail.length - 1;
    const idxB = (tail.length * 0.5) | 0;
    const idxC = 0;
    for (const idx of [idxA, idxB, idxC]) {
      const seg = tail[idx];
      if (!seg?.mesh) continue;
      const v = seg.value ?? 0;
      if (v <= 0 || v > botValue) continue;
      const dx = seg.mesh.position.x - botPos.x;
      const dz = seg.mesh.position.z - botPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0;
      if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
      const invD = 1 / Math.max(1e-6, d);
      const tx = dx * invD;
      const tz = dz * invD;
      const dot = (botDir.x ?? 0) * tx + (botDir.z ?? 0) * tz;
      const front = clamp01((dot + 1) * 0.5);
      const frontMul = THREE.MathUtils.lerp(0.75, 1.15, front);
      const ownerDanger = ownerValue > botValue ? clamp01((ownerValue / Math.max(1, botValue) - 1) * 0.65) : 0;
      const marginal = v / Math.max(1, botValue);
      const desirability =
        (Math.pow(marginal, 0.7 + brain.personality.opportunism * 0.6) * frontMul) /
        Math.pow(d + 0.35, 1.1);
      const riskPenalty = 1 + ownerDanger * (0.8 + brain.personality.caution * 1.2);
      const score = desirability / riskPenalty + brain.noiseValue * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = { seg, owner, dist: d, value: v, ownerValue, id: seg.mesh.uuid };
      }
    }
  }
  if (!best) return null;
  return { ...best, score: bestScore };
}

function findBestPrey(bot, brain) {
  const botPos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);
  if (shouldMiss(brain, "opportunity", load01)) return null;
  const killAll = brain.objective === "killAll";
  let prey = null;
  let preyDist = Infinity;
  let preyValue = 0;
  const preyValueThreshold = botValue * (0.82 - brain.personality.aggressiveness * 0.14);
  let bestScore = -Infinity;
  for (const other of players) {
    if (!other || other === bot) continue;
    const otherValue = other.head.value ?? 0;
    if (killAll) {
      if (otherValue <= 0 || otherValue >= botValue) continue;
    } else {
      if (otherValue <= 0 || otherValue >= preyValueThreshold) continue;
    }
    const pos = other.head.mesh.position;
    const dx = pos.x - botPos.x;
    const dz = pos.z - botPos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
    if (killAll) {
      const ratio = otherValue / Math.max(1, botValue);
      const score = Math.pow(ratio, 0.9) / Math.pow(d + 0.8, 1.05);
      if (score > bestScore) {
        bestScore = score;
        preyDist = d;
        prey = other;
        preyValue = otherValue;
      }
    } else if (d < preyDist) {
      preyDist = d;
      prey = other;
      preyValue = otherValue;
    }
  }
  if (!prey) return null;
  const gain = preyValue / Math.max(1, botValue);
  const score = killAll ? Math.max(0, bestScore) : gain / Math.pow(preyDist + 0.6, 1.05);
  return { prey, dist: preyDist, value: preyValue, score, id: prey.head.mesh.uuid };
}

function computeTailDefense(bot, brain) {
  const botValue = bot.head.value ?? 0;
  const botSize = bot.head.size ?? 0;
  const tail = bot.tail;
  if (!Array.isArray(tail) || tail.length === 0) return null;
  const defendMinValue = Math.max(16, botValue * 0.02);
  const important = tail
    .filter((s) => (s?.value ?? 0) >= defendMinValue && s?.mesh)
    .sort((a, b) => (b?.value ?? 0) - (a?.value ?? 0))
    .slice(0, 4);
  if (important.length === 0) return null;
  const defendRadius = 2.2 + botSize * 1.3;
  let best = null;
  let bestScore = 0;
  for (const seg of important) {
    const segPos = seg.mesh.position;
    for (const other of players) {
      if (!other || other === bot) continue;
      const otherValue = other.head.value ?? 0;
      if (otherValue <= 0) continue;
      if (otherValue < (seg.value ?? 0)) continue;
      const op = other.head.mesh.position;
      const dx = op.x - segPos.x;
      const dz = op.z - segPos.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0;
      if (d > defendRadius) continue;
      const t = clamp01((defendRadius - d) / Math.max(1e-6, defendRadius));
      const importance = clamp01((seg.value ?? 0) / Math.max(1, botValue));
      const score = t * (0.65 + importance * 1.25);
      if (score > bestScore) {
        bestScore = score;
        best = { attacker: other, seg, dist: d, score, attackerValue: otherValue, segValue: seg.value ?? 0 };
      }
    }
  }
  if (!best) return null;
  return best;
}

function getFreeCubeById(id) {
  if (!id) return null;
  const cubes = freeCubeSpawner.cubes;
  if (!Array.isArray(cubes) || cubes.length === 0) return null;
  for (const entry of cubes) {
    const c = entry?.cube;
    if (c?.mesh?.uuid === id) return c;
  }
  return null;
}

function getTailSegById(id) {
  if (!id) return null;
  for (const p of players) {
    const tail = p?.tail;
    if (!Array.isArray(tail)) continue;
    for (const seg of tail) {
      if (seg?.mesh?.uuid === id) return { seg, owner: p };
    }
  }
  return null;
}

function getPlayerByHeadId(id) {
  if (!id) return null;
  for (const p of players) if (p?.head?.mesh?.uuid === id) return p;
  return null;
}

function isPlanTargetValid(bot, plan) {
  if (!plan) return false;
  if (plan.type === "collect" && plan.targetKind === "cube" && plan.targetId) {
    for (const entry of freeCubeSpawner.cubes) {
      const c = entry?.cube;
      if (c?.mesh?.uuid === plan.targetId) return true;
    }
    return false;
  }
  if ((plan.type === "harvestTail" || plan.type === "defendTail") && plan.targetId) {
    for (const p of players) {
      if (!p?.tail) continue;
      for (const seg of p.tail) if (seg?.mesh?.uuid === plan.targetId) return true;
    }
    return false;
  }
  if (plan.type === "hunt" && plan.targetId) {
    for (const p of players) if (p?.head?.mesh?.uuid === plan.targetId) return true;
    return false;
  }
  if (plan.type === "escape" || plan.type === "wander") return true;
  return true;
}

function updatePlanTargetPos(bot, brain, nowSec) {
  const plan = brain.plan;
  if (!plan) return;
  if (plan.type === "escape") return;
  if (plan.type === "wander") return;
  if (plan.type === "collect" && plan.targetKind === "cube") {
    for (const entry of freeCubeSpawner.cubes) {
      const c = entry?.cube;
      if (c?.mesh?.uuid !== plan.targetId) continue;
      const t = clampTargetToArena(bot, plan.type, c.mesh.position.x, c.mesh.position.z);
      plan.x = t.x;
      plan.z = t.z;
      return;
    }
    return;
  }
  if (plan.type === "harvestTail") {
    for (const p of players) {
      if (!Array.isArray(p?.tail)) continue;
      for (const seg of p.tail) {
        if (seg?.mesh?.uuid !== plan.targetId) continue;
        const t = clampTargetToArena(bot, plan.type, seg.mesh.position.x, seg.mesh.position.z);
        plan.x = t.x;
        plan.z = t.z;
        return;
      }
    }
    return;
  }
  if (plan.type === "hunt") {
    for (const p of players) {
      if (p?.head?.mesh?.uuid !== plan.targetId) continue;
      const pos = p.head.mesh.position;
      const dir = p.headDirection ?? new THREE.Vector3(0, 0, -1);
      const dx = pos.x - bot.head.mesh.position.x;
      const dz = pos.z - bot.head.mesh.position.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 0;
      const leadBase = clamp(d * 0.35, 1.1, 5.5);
      const lead = leadBase * (0.55 + brain.personality.aggressiveness * 0.65);
      const close = d < 2.2 + (bot.head.size ?? 0) * 1.4;
      const t = clampTargetToArena(bot, plan.type, pos.x + (close ? 0 : (dir.x ?? 0) * lead), pos.z + (close ? 0 : (dir.z ?? 0) * lead));
      plan.x = t.x;
      plan.z = t.z;
      return;
    }
  }
  if (plan.type === "defendTail") {
    for (const p of players) {
      if (p?.head?.mesh?.uuid !== plan.targetId) continue;
      const t = clampTargetToArena(bot, plan.type, p.head.mesh.position.x, p.head.mesh.position.z);
      plan.x = t.x;
      plan.z = t.z;
      return;
    }
  }
}

function findKillablePrey(bot, brain) {
  const botPos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);
  if (shouldMiss(brain, "opportunity", load01)) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const other of players) {
    if (!other || other === bot || !other?.head?.mesh) continue;
    const otherValue = other.head.value ?? 0;
    if (otherValue <= 0 || otherValue >= botValue) continue;
    const pos = other.head.mesh.position;
    const dx = pos.x - botPos.x;
    const dz = pos.z - botPos.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 0;
    if (!isVisible(bot, brain, dx, dz, d, "opportunity")) continue;
    const ratio = otherValue / Math.max(1, botValue);
    const score = Math.pow(ratio, 0.9) / Math.pow(d + 0.8, 1.05);
    if (score > bestScore) {
      bestScore = score;
      best = { prey: other, id: other.head.mesh.uuid, dist: d, value: otherValue, score };
    }
  }
  return best;
}

function thinkMockLLM(bot, brain, nowSec) {
  const t0 = performance.now();
  updatePlanTargetPos(bot, brain, nowSec);

  const plan = brain.plan;
  const planValid = isPlanTargetValid(bot, plan);
  const commitLocked = plan && nowSec < (plan.commitUntilSec ?? 0);
  const minThink = Math.max(0.12, brain.minThinkIntervalSec);

  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);
  const threatInfo = computeThreat(bot, brain);
  if (threatInfo && threatInfo.level > 0.92 && (!plan || plan.type !== "escape")) {
    const pos = bot.head.mesh.position;
    const botSize = bot.head.size ?? 0;
    const th = threatInfo.threat;
    if (th?.head?.mesh) {
      const tPos = th.head.mesh.position;
      let ax = pos.x - tPos.x;
      let az = pos.z - tPos.z;
      const al = Math.sqrt(ax * ax + az * az) || 1;
      ax /= al;
      az /= al;
      const half = mapSize / 2;
      const margin = botSize / 2 + 0.8;
      const push = (3.8 + botSize * 11) * (0.9 + brain.personality.caution * 0.35);
      setPlan(brain, nowSec, {
        type: "escape",
        targetKind: "point",
        targetId: th.head.mesh.uuid,
        x: clamp(pos.x + ax * push, -half + margin, half - margin),
        z: clamp(pos.z + az * push, -half + margin, half - margin),
        reason: "llm:escape",
      });
      brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
      return;
    }
  }
  if (shouldMiss(brain, "threat", load01)) threatInfo;

  if (plan && planValid && commitLocked) {
    brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
    return;
  }

  const prey = findKillablePrey(bot, brain);
  const cube = findBestFreeCube(bot, brain);
  const tail = findBestTailToHarvest(bot, brain);

  let newPlan = null;
  let reason = "llm";
  if (prey?.prey?.head?.mesh) {
    newPlan = {
      type: "hunt",
      targetKind: "player",
      targetId: prey.id,
      x: prey.prey.head.mesh.position.x,
      z: prey.prey.head.mesh.position.z,
    };
    reason = "llm:hunt";
  } else if (tail?.seg?.mesh) {
    newPlan = {
      type: "harvestTail",
      targetKind: "tail",
      targetId: tail.id,
      targetOwnerId: tail.owner?.head?.mesh?.uuid ?? null,
      x: tail.seg.mesh.position.x,
      z: tail.seg.mesh.position.z,
    };
    reason = "llm:harvest";
  } else if (cube?.cube?.mesh) {
    newPlan = {
      type: "collect",
      targetKind: "cube",
      targetId: cube.id,
      x: cube.cube.mesh.position.x,
      z: cube.cube.mesh.position.z,
    };
    reason = "llm:collect";
  } else {
    const pos = bot.head.mesh.position;
    const botSize = bot.head.size ?? 0;
    const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
    const fwdLen = Math.sqrt((botDir.x ?? 0) ** 2 + (botDir.z ?? 0) ** 2) || 1;
    const fx = (botDir.x ?? 0) / fwdLen;
    const fz = (botDir.z ?? 0) / fwdLen;
    const px = -fz;
    const pz = fx;
    const half = mapSize / 2;
    const margin = botSize / 2 + 0.8;
    const dist = randomBetween(6, 16);
    const side = randomSign() * randomBetween(0, 7.5);
    newPlan = {
      type: "wander",
      targetKind: "point",
      targetId: null,
      x: clamp(pos.x + fx * dist + px * side, -half + margin, half - margin),
      z: clamp(pos.z + fz * dist + pz * side, -half + margin, half - margin),
    };
    reason = "llm:wander";
  }

  if (newPlan) setPlan(brain, nowSec, { ...newPlan, reason });
  brain.llmNextAtSec = nowSec + THREE.MathUtils.lerp(0.55, 0.22, clamp01(brain.personality.reactionSpeed));
  brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);

  if (isBotTracked(bot)) {
    const decisionMs = performance.now() - t0;
    console.log(
      `[LLM-MOCK] ${getPlayerName(bot)} plan=${brain.plan?.type ?? "-"} reason=${brain.plan?.reason ?? "-"} cpu=${decisionMs.toFixed(2)}ms`,
    );
  }
}

function thinkBot(bot, brain, nowSec) {
  const t0 = performance.now();
  const planType = brain.plan?.type ?? null;
  const load01 = computePlanLoad01(planType);

  brain.noiseValue = brain.noiseValue * 0.7 + (Math.random() - 0.5) * 0.3;

  const pos = bot.head.mesh.position;
  const botValue = bot.head.value ?? 0;
  const botSize = bot.head.size ?? 0;

  updatePlanTargetPos(bot, brain, nowSec);

  const plan = brain.plan;
  const planValid = isPlanTargetValid(bot, plan);
  const reachDist = 1.05 + botSize * 0.55;
  const dxp = plan ? plan.x - pos.x : 0;
  const dzp = plan ? plan.z - pos.z : 0;
  const planDist = plan ? Math.sqrt(dxp * dxp + dzp * dzp) : Infinity;

  const threatInfo = computeThreat(bot, brain);
  const emergency = threatInfo && threatInfo.level > 0.72;
  if (threatInfo && threatInfo.level > 0.52 && !brain.pendingInterrupt && !shouldMiss(brain, "threat", load01)) {
    brain.pendingInterrupt = {
      type: "escape",
      dueAtSec: nowSec + brain.reactionDelaySec,
      threatId: threatInfo.threat?.head?.mesh?.uuid ?? null,
    };
  }
  if (brain.pendingInterrupt && nowSec >= brain.pendingInterrupt.dueAtSec) {
    const th = threatInfo?.threat;
    if (th?.head?.mesh) {
      const tPos = th.head.mesh.position;
      let ax = pos.x - tPos.x;
      let az = pos.z - tPos.z;
      const al = Math.sqrt(ax * ax + az * az) || 1;
      ax /= al;
      az /= al;
      const half = mapSize / 2;
      const margin = botSize / 2 + 0.8;
      const push = (3.8 + botSize * 11) * (0.9 + brain.personality.caution * 0.35);
      setPlan(brain, nowSec, {
        type: "escape",
        targetKind: "point",
        targetId: th.head.mesh.uuid,
        x: clamp(pos.x + ax * push, -half + margin, half - margin),
        z: clamp(pos.z + az * push, -half + margin, half - margin),
        reason: "emergency",
      });
      brain.pendingInterrupt = null;
    } else {
      brain.pendingInterrupt = null;
    }
  }

  const nowMs = performance.now();
  const last = Number(brain._dbgLastDecisionAtMs) || 0;
  const dtSec = last > 0 ? (nowMs - last) / 1000 : 0;
  brain._dbgLastDecisionAtMs = nowMs;

  const tailDefense = computeTailDefense(bot, brain);
  const bestCube = findBestFreeCube(bot, brain);
  const bestTail = findBestTailToHarvest(bot, brain);
  const bestPrey = findBestPrey(bot, brain);

  const p = brain.personality;
  const killAll = brain.objective === "killAll";

  const huntUpgradeFactor = THREE.MathUtils.lerp(1.75, 1.2, p.aggressiveness) * THREE.MathUtils.lerp(1.1, 0.85, p.opportunism);
  const harvestUpgradeFactor = THREE.MathUtils.lerp(1.4, 1.05, p.opportunism) * THREE.MathUtils.lerp(1.15, 0.9, p.greed);

  const bestCubeGain = bestCube ? (bestCube.value ?? 0) / Math.max(1, botValue) : 0;
  const bestTailGain = bestTail ? (bestTail.value ?? 0) / Math.max(1, botValue) : 0;
  const bestPreyGain = bestPrey ? (bestPrey.value ?? 0) / Math.max(1, botValue) : 0;

  const commitLocked = plan && nowSec < (plan.commitUntilSec ?? 0);
  const minThink = Math.max(0.12, brain.minThinkIntervalSec);

  const planNear = plan && planDist < reachDist;
  const planNearLongEnough = planNear && nowSec - (plan.createdAtSec ?? nowSec) > minThink * 0.9;
  const planCompleted = plan
    ? plan.type === "collect" || plan.type === "harvestTail"
      ? !planValid
      : killAll && plan.type === "hunt"
        ? false
        : planNearLongEnough
    : false;

  if (plan && planValid) {
    const distNow = planDist;
    const distPrev = Number.isFinite(plan.lastDist) ? plan.lastDist : Infinity;
    const improved = distNow < distPrev - 0.15;
    plan.lastDist = distNow;
    const stuckIncrease = improved ? -minThink * 2.0 : minThink;
    plan.stuckSec = Math.max(0, (plan.stuckSec ?? 0) + stuckIncrease);
  }

  const forceReplan = !plan || !planValid || planCompleted || (plan && (plan.stuckSec ?? 0) > THREE.MathUtils.lerp(1.2, 2.6, p.patience));

  let newPlan = null;
  let reason = "";

  const panic = threatInfo && threatInfo.level > 0.92 && Math.random() < clamp01(p.reactionSpeed * 0.55 + p.attention * 0.35);
  if (panic && (!plan || plan.type !== "escape")) {
    const th = threatInfo?.threat;
    if (th?.head?.mesh) {
      const tPos = th.head.mesh.position;
      let ax = pos.x - tPos.x;
      let az = pos.z - tPos.z;
      const al = Math.sqrt(ax * ax + az * az) || 1;
      ax /= al;
      az /= al;
      const half = mapSize / 2;
      const margin = botSize / 2 + 0.8;
      const push = (3.8 + botSize * 11) * (0.9 + p.caution * 0.35);
      newPlan = {
        type: "escape",
        targetKind: "point",
        targetId: th.head.mesh.uuid,
        x: clamp(pos.x + ax * push, -half + margin, half - margin),
        z: clamp(pos.z + az * push, -half + margin, half - margin),
      };
      reason = "panic";
    }
  }

  if (!newPlan && tailDefense && tailDefense.score > THREE.MathUtils.lerp(0.78, 0.4, p.defensiveness)) {
    const attacker = tailDefense.attacker;
    if (attacker?.head?.mesh && plan?.type !== "escape") {
      const attackerValue = attacker.head.value ?? 0;
      if (killAll && attackerValue > 0 && attackerValue < botValue) {
        newPlan = {
          type: "hunt",
          targetKind: "player",
          targetId: attacker.head.mesh.uuid,
          x: attacker.head.mesh.position.x,
          z: attacker.head.mesh.position.z,
        };
        reason = "punish";
      } else {
        newPlan = {
          type: "defendTail",
          targetKind: "player",
          targetId: attacker.head.mesh.uuid,
          x: attacker.head.mesh.position.x,
          z: attacker.head.mesh.position.z,
        };
        reason = "defendTail";
      }
    }
  }

  if (
    !newPlan &&
    killAll &&
    bestPrey?.prey?.head?.mesh &&
    (!plan || plan.type !== "hunt") &&
    (!commitLocked || forceReplan || nowSec - (plan?.createdAtSec ?? nowSec) > minThink * 0.75)
  ) {
    newPlan = {
      type: "hunt",
      targetKind: "player",
      targetId: bestPrey.id,
      x: bestPrey.prey.head.mesh.position.x,
      z: bestPrey.prey.head.mesh.position.z,
    };
    reason = "hunt";
  }

  if (!newPlan && killAll && plan && planValid && plan.type === "hunt" && commitLocked && !forceReplan) {
    brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
    return;
  }

  if (!newPlan && plan && planValid && !forceReplan) {
    const currentUtility = (() => {
      const self = Math.max(1, botValue);
      if (plan.type === "collect" && plan.targetKind === "cube") {
        const cube = getFreeCubeById(plan.targetId);
        if (!cube?.mesh) return 0;
        const v = cube.value ?? 0;
        if (!(v > 0) || v > botValue) return 0;
        const dx = cube.mesh.position.x - pos.x;
        const dz = cube.mesh.position.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 0;
        return (v / self) / (d + 0.7);
      }
      if (plan.type === "harvestTail" && plan.targetKind === "tail") {
        const r = getTailSegById(plan.targetId);
        const seg = r?.seg;
        if (!seg?.mesh) return 0;
        const v = seg.value ?? 0;
        if (!(v > 0) || v > botValue) return 0;
        const dx = seg.mesh.position.x - pos.x;
        const dz = seg.mesh.position.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 0;
        return (v / self) / (d + 0.7);
      }
      if (plan.type === "hunt" && plan.targetKind === "player") {
        const prey = getPlayerByHeadId(plan.targetId);
        if (!prey?.head?.mesh) return 0;
        const v = prey.head.value ?? 0;
        if (!(v > 0) || v >= botValue) return 0;
        const dx = prey.head.mesh.position.x - pos.x;
        const dz = prey.head.mesh.position.z - pos.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 0;
        return (v / self) / (d + 0.9);
      }
      return 0;
    })();

    const bestCandidate = (() => {
      const self = Math.max(1, botValue);
      let best = null;
      const consider = (cand) => {
        if (!cand) return;
        if (!best || cand.utility > best.utility) best = cand;
      };
      if (!killAll && bestCube?.cube?.mesh) {
        consider({
          type: "collect",
          targetKind: "cube",
          targetId: bestCube.id,
          x: bestCube.cube.mesh.position.x,
          z: bestCube.cube.mesh.position.z,
          utility: (Number(bestCube.value) / self) / ((Number(bestCube.dist) || 0) + 0.7),
          value: Number(bestCube.value) || 0,
        });
      }
      if (!killAll && bestTail?.seg?.mesh) {
        consider({
          type: "harvestTail",
          targetKind: "tail",
          targetId: bestTail.id,
          targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
          x: bestTail.seg.mesh.position.x,
          z: bestTail.seg.mesh.position.z,
          utility: (Number(bestTail.value) / self) / ((Number(bestTail.dist) || 0) + 0.7),
        });
      }
      if (bestPrey?.prey?.head?.mesh) {
        consider({
          type: "hunt",
          targetKind: "player",
          targetId: bestPrey.id,
          x: bestPrey.prey.head.mesh.position.x,
          z: bestPrey.prey.head.mesh.position.z,
          utility: (Number(bestPrey.value) / self) / ((Number(bestPrey.dist) || 0) + 0.9),
        });
      }
      return best;
    })();

    const cand = bestCandidate;
    const candKey = cand ? `${cand.type}|${cand.targetKind ?? ""}|${cand.targetId ?? ""}` : "";
    const curKey = planKey(plan);
    const isDifferentTarget = cand && candKey !== curKey;
    const baseThreshold = THREE.MathUtils.lerp(1.2, 2.1, clamp01(p.stubbornness)) * THREE.MathUtils.lerp(1.0, 1.2, clamp01(p.discipline));
    const threshold = baseThreshold * (commitLocked ? 1.25 : 1.0);
    const upgradeFactor = currentUtility > 1e-6 ? (cand?.utility ?? 0) / currentUtility : cand?.utility ?? 0;

    let easyThreshold = threshold;
    if (plan.type === "collect" && cand?.type === "collect") {
      const curCube = getFreeCubeById(plan.targetId);
      const curV = Number(curCube?.value ?? 0) || 0;
      const candV = Number(cand?.value ?? 0) || 0;
      if (candV > curV) easyThreshold = Math.min(easyThreshold, THREE.MathUtils.lerp(1.08, 1.32, clamp01(p.stubbornness)));
    }

    if (isDifferentTarget && cand && upgradeFactor >= easyThreshold) {
      newPlan = { ...cand };
      reason = "upgrade";
    } else {
      brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
      return;
    }
  }

  if (!newPlan && (!commitLocked || forceReplan)) {
    if (tailDefense && tailDefense.score > THREE.MathUtils.lerp(0.75, 0.45, p.defensiveness)) {
      const attacker = tailDefense.attacker;
      if (attacker?.head?.mesh) {
        const attackerValue = attacker.head.value ?? 0;
        if (killAll && attackerValue > 0 && attackerValue < botValue) {
          newPlan = {
            type: "hunt",
            targetKind: "player",
            targetId: attacker.head.mesh.uuid,
            x: attacker.head.mesh.position.x,
            z: attacker.head.mesh.position.z,
          };
          reason = "punish";
        } else {
          newPlan = {
            type: "defendTail",
            targetKind: "player",
            targetId: attacker.head.mesh.uuid,
            x: attacker.head.mesh.position.x,
            z: attacker.head.mesh.position.z,
          };
          reason = "defendTail";
        }
      }
    }

    if (!newPlan) {
      const collectOk = bestCube && bestCubeGain > 0;
      const harvestOk = bestTail && bestTailGain > 0;
      const huntOk = bestPrey && bestPreyGain > 0;

      if (killAll) {
        if (huntOk) {
          newPlan = {
            type: "hunt",
            targetKind: "player",
            targetId: bestPrey.id,
            x: bestPrey.prey.head.mesh.position.x,
            z: bestPrey.prey.head.mesh.position.z,
          };
          reason = "hunt";
        } else if (harvestOk) {
          newPlan = {
            type: "harvestTail",
            targetKind: "tail",
            targetId: bestTail.id,
            targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
            x: bestTail.seg.mesh.position.x,
            z: bestTail.seg.mesh.position.z,
          };
          reason = "harvest";
        } else if (collectOk) {
          newPlan = {
            type: "collect",
            targetKind: "cube",
            targetId: bestCube.id,
            x: bestCube.cube.mesh.position.x,
            z: bestCube.cube.mesh.position.z,
          };
          reason = "collect";
        }
      } else {
        if (collectOk) {
          newPlan = {
            type: "collect",
            targetKind: "cube",
            targetId: bestCube.id,
            x: bestCube.cube.mesh.position.x,
            z: bestCube.cube.mesh.position.z,
          };
          reason = "collect";
        } else if (harvestOk) {
          newPlan = {
            type: "harvestTail",
            targetKind: "tail",
            targetId: bestTail.id,
            targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
            x: bestTail.seg.mesh.position.x,
            z: bestTail.seg.mesh.position.z,
          };
          reason = "harvest";
        }

        if (huntOk) {
          const collectUtility = collectOk ? bestCubeGain : 0;
          const harvestUtility = harvestOk ? bestTailGain : 0;
          const bestSafeUtility = Math.max(collectUtility, harvestUtility);
          const worth = bestSafeUtility <= 0 ? true : bestPreyGain >= bestSafeUtility * huntUpgradeFactor;
          if (worth && (!newPlan || bestSafeUtility <= 0)) {
            newPlan = {
              type: "hunt",
              targetKind: "player",
              targetId: bestPrey.id,
              x: bestPrey.prey.head.mesh.position.x,
              z: bestPrey.prey.head.mesh.position.z,
            };
            reason = "hunt";
          }
        }

        if (harvestOk && collectOk && newPlan?.type === "collect") {
          const harvestWorth = bestTailGain >= bestCubeGain * harvestUpgradeFactor;
          if (harvestWorth && p.opportunism > 0.42) {
            newPlan = {
              type: "harvestTail",
              targetKind: "tail",
              targetId: bestTail.id,
              targetOwnerId: bestTail.owner?.head?.mesh?.uuid ?? null,
              x: bestTail.seg.mesh.position.x,
              z: bestTail.seg.mesh.position.z,
            };
            reason = "harvest>collect";
          }
        }
      }

      if (!newPlan) {
        const botDir = bot.headDirection ?? new THREE.Vector3(0, 0, -1);
        const fwdLen = Math.sqrt((botDir.x ?? 0) ** 2 + (botDir.z ?? 0) ** 2) || 1;
        const fx = (botDir.x ?? 0) / fwdLen;
        const fz = (botDir.z ?? 0) / fwdLen;
        const px = -fz;
        const pz = fx;
        const half = mapSize / 2;
        const margin = botSize / 2 + 0.8;
        const dist = randomBetween(6, 16) * (0.8 + p.curiosity * 0.45);
        const side = randomSign() * randomBetween(0, 7.5);
        newPlan = {
          type: "wander",
          targetKind: "point",
          targetId: null,
          x: clamp(pos.x + fx * dist + px * side, -half + margin, half - margin),
          z: clamp(pos.z + fz * dist + pz * side, -half + margin, half - margin),
        };
        reason = "wander";
      }
    }
  }

  if (newPlan) {
    const prevKey = planKey(brain.plan);
    const candKey = `${newPlan.type}|${newPlan.targetKind ?? ""}|${newPlan.targetId ?? ""}`;
    if (prevKey === candKey && brain.plan) {
      brain.plan.x = Number(newPlan.x) || brain.plan.x;
      brain.plan.z = Number(newPlan.z) || brain.plan.z;
      brain.plan.reason = brain.plan.reason || String(reason || "");
      brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
      return;
    }

    setPlan(brain, nowSec, { ...newPlan, reason });
    brain.decisionCounter += 1;
    const nextKey = planKey(brain.plan);
    if (isBotTracked(bot)) {
      const decisionMs = performance.now() - t0;
      const extra =
        brain.plan.type === "escape"
          ? ` danger=${threatInfo ? threatInfo.level.toFixed(2) : "0"}`
          : brain.plan.type === "collect"
            ? ` cube=${bestCube?.value ?? 0} d=${bestCube?.dist?.toFixed(2) ?? "-"}`
            : brain.plan.type === "harvestTail"
              ? ` tail=${bestTail?.value ?? 0} owner=${bestTail?.owner ? getPlayerName(bestTail.owner) : "-"} d=${bestTail?.dist?.toFixed(2) ?? "-"}`
              : brain.plan.type === "hunt"
                ? ` prey=${bestPrey ? getPlayerName(bestPrey.prey) : "-"} d=${bestPrey?.dist?.toFixed(2) ?? "-"}`
                : brain.plan.type === "defendTail"
                  ? ` seg=${tailDefense?.segValue ?? 0} attacker=${tailDefense?.attacker ? getPlayerName(tailDefense.attacker) : "-"}`
                  : "";
      console.log(
        `[AI] ${getPlayerName(bot)} * plan=${brain.plan.type} reason=${brain.plan.reason} dt=${dtSec.toFixed(3)}s cpu=${decisionMs.toFixed(2)}ms target=(${brain.plan.x.toFixed(2)},${brain.plan.z.toFixed(2)})${extra}`,
      );
    }
  }

  brain.nextThinkAtSec = Math.max(brain.nextThinkAtSec, nowSec + minThink);
}

function steerBot(bot, brain, dt) {
  const pos = bot.head.mesh.position;
  const plan = brain.plan;
  if (!plan) return;
  const dx = plan.x - pos.x;
  const dz = plan.z - pos.z;
  let vx = dx;
  let vz = dz;

  const half = mapSize / 2;
  const headSize = bot.head.size ?? 0;
  const mode = plan.type || "wander";
  const killAll = brain.objective === "killAll";
  const safeBase =
    mode === "escape"
      ? 1.6 + headSize * 1.5
      : mode === "collect" || mode === "harvestTail"
        ? 0.85 + headSize * 0.85
        : 1.15 + headSize * 1.15;
  const targetNearWall =
    Math.abs(plan.x) > half - safeBase * 0.55 || Math.abs(plan.z) > half - safeBase * 0.55;
  const safe =
    targetNearWall && (mode === "collect" || mode === "harvestTail")
      ? safeBase * 0.55
      : targetNearWall && mode === "hunt"
        ? safeBase * 0.18
        : safeBase;
  const wallK =
    mode === "escape"
      ? 4
      : mode === "collect" || mode === "harvestTail"
        ? 2.4
        : targetNearWall && mode === "hunt"
          ? 0.9
          : 3.2;
  if (pos.x > half - safe) vx -= (pos.x - (half - safe)) * wallK;
  if (pos.x < -half + safe) vx += (-half + safe - pos.x) * wallK;
  if (pos.z > half - safe) vz -= (pos.z - (half - safe)) * wallK;
  if (pos.z < -half + safe) vz += (-half + safe - pos.z) * wallK;

  const botValue = bot.head.value ?? 0;
  const botSize = bot.head.size ?? 0;
  const avoidDist = 3.2 + botSize * 2.25;
  const avoidMul = mode === "escape" ? 1.25 : mode === "collect" || mode === "harvestTail" ? 0.85 : 1.0;
  for (const other of players) {
    if (!other || other === bot || !other?.head?.mesh) continue;
    const oPos = other.head.mesh.position;
    const ox = pos.x - oPos.x;
    const oz = pos.z - oPos.z;
    const od = Math.sqrt(ox * ox + oz * oz) || 0;
    if (!(od > 1e-6) || od > avoidDist) continue;
    const oValue = other.head.value ?? 0;
    const isHuntTarget = mode === "hunt" && plan.targetKind === "player" && plan.targetId && other.head.mesh.uuid === plan.targetId;
    const scale =
      killAll && isHuntTarget && oValue > 0 && oValue < botValue
        ? -0.18 * avoidMul
        : (oValue > botValue ? 1.6 : 0.5) * avoidMul;
    const t = (avoidDist - od) / avoidDist;
    const k = scale * (t * t) * 2.6;
    vx += (ox / od) * k;
    vz += (oz / od) * k;

    const tail = other.tail;
    if (!Array.isArray(tail) || tail.length === 0) continue;
    const idxA = tail.length - 1;
    const idxB = (tail.length * 0.5) | 0;
    for (const idx of [idxA, idxB]) {
      const seg = tail[idx];
      if (!seg?.mesh) continue;
      const sx = pos.x - seg.mesh.position.x;
      const sz = pos.z - seg.mesh.position.z;
      const sd = Math.sqrt(sx * sx + sz * sz) || 0;
      if (!(sd > 1e-6) || sd > avoidDist) continue;
      const sValue = seg.value ?? 0;
      const st = (avoidDist - sd) / avoidDist;
      if (sValue > botValue) {
        const sScale = 1.4 * avoidMul;
        const sk = sScale * (st * st) * 2.0;
        vx += (sx / sd) * sk;
        vz += (sz / sd) * sk;
      } else if (mode === "harvestTail") {
        const headThreat = oValue > botValue ? clamp01(((avoidDist * 0.8) - od) / Math.max(1e-6, avoidDist * 0.8)) : 0;
        const aScale = (0.75 + brain.personality.opportunism * 0.85) * (1 - headThreat * (0.6 + brain.personality.caution * 0.65));
        const ak = aScale * (st * st) * 1.9;
        vx -= (sx / sd) * ak;
        vz -= (sz / sd) * ak;
      }
    }
  }

  const shouldWanderCurve = plan.type === "wander" || plan.type === "collect";
  if (shouldWanderCurve) {
    const t = Math.max(0, Number(dt) || 0);
    brain.wanderPhase = (Number(brain.wanderPhase) || 0) + t * (Number(brain.wanderTurnSpeed) || 0);
    const amp = THREE.MathUtils.lerp(0.05, 0.22, brain.personality.curiosity) * THREE.MathUtils.lerp(0.25, 0.8, 1 - brain.personality.focus);
    const px = -vz;
    const pz = vx;
    const wave = Math.sin(brain.wanderPhase) * amp;
    vx += px * wave;
    vz += pz * wave;
  }

  if (mode !== "escape" && (!killAll || mode === "collect" || mode === "harvestTail")) {
    const cubes = freeCubeSpawner.cubes;
    if (Array.isArray(cubes) && cubes.length > 0) {
      const baseLen = Math.sqrt(vx * vx + vz * vz) || 1;
      const dirX = vx / baseLen;
      const dirZ = vz / baseLen;
      const perpX = -dirZ;
      const perpZ = dirX;
      const selfLog = Math.log2(Math.max(2, botValue));
      const big = clamp01((selfLog - 8) / 8);
      const ignore =
        THREE.MathUtils.lerp(0.0025, 0.02, big) *
        THREE.MathUtils.lerp(1.15, 0.75, brain.personality.curiosity) *
        0.65;
      const localRadius = 4.5 + botSize * 1.55;
      const corridorAhead = 5.5 + botSize * 2.1;
      const corridorWidth = 2.0 + botSize * 1.05;
      const load01 = computePlanLoad01(mode);
      const focusMul = THREE.MathUtils.lerp(0.95, 0.35, clamp01(brain.personality.focus) * load01);
      let ax = 0;
      let az = 0;
      const samples = Math.min(10, cubes.length);
      for (let i = 0; i < samples; i += 1) {
        const entry = cubes[(Math.random() * cubes.length) | 0];
        const cube = entry?.cube;
        if (!cube?.mesh) continue;
        const v = cube.value ?? 0;
        if (v <= 0 || v > botValue) continue;
        const cx = cube.mesh.position.x;
        const cz = cube.mesh.position.z;
        const cdx = cx - pos.x;
        const cdz = cz - pos.z;
        const d = Math.sqrt(cdx * cdx + cdz * cdz) || 0;
        if (!(d > 1e-6) || d > localRadius) continue;
        if (!isVisible(bot, brain, cdx, cdz, d, "opportunity")) continue;
        const marginal = v / Math.max(1, botValue);
        if (marginal < ignore) continue;
        const along = cdx * dirX + cdz * dirZ;
        if (along < 0.0 || along > corridorAhead) continue;
        const side = Math.abs(cdx * perpX + cdz * perpZ);
        if (side > corridorWidth) continue;
        const sideMul = 1 - side / Math.max(1e-6, corridorWidth);
        const desirability = Math.pow(marginal, 0.65 + brain.personality.greed * 0.35) / (d + 0.25);
        const score = desirability * sideMul * focusMul;
        ax += (cdx / d) * score;
        az += (cdz / d) * score;
      }
      const aLen = Math.sqrt(ax * ax + az * az) || 0;
      if (aLen > 1e-6) {
        const strength = THREE.MathUtils.lerp(0.55, 1.05, clamp01(brain.personality.opportunism)) * focusMul;
        vx += (ax / aLen) * strength;
        vz += (az / aLen) * strength;
      }
    }
  }

  const len = Math.sqrt(vx * vx + vz * vz) || 1;
  const desiredX = vx / len;
  const desiredZ = vz / len;
  const sx = Number(brain.steerX);
  const sz = Number(brain.steerZ);
  const alpha = clamp((Number(dt) || 0) * 7.5, 0, 1);
  const nx = Number.isFinite(sx) ? THREE.MathUtils.lerp(sx, desiredX, alpha) : desiredX;
  const nz = Number.isFinite(sz) ? THREE.MathUtils.lerp(sz, desiredZ, alpha) : desiredZ;
  const nLen = Math.sqrt(nx * nx + nz * nz) || 1;
  brain.steerX = nx / nLen;
  brain.steerZ = nz / nLen;
  bot.setLookDirFromMove(brain.steerX, brain.steerZ);
}

env.addUpdatable({
  update(dt, t) {
    const nowSec = (Number.isFinite(t) ? t : performance.now()) * 0.001;
    for (const bot of bots) {
      const brain = bot.ai;
      if (!brain) continue;
      if (brain.llmMode === "mock" && isLLMBot(bot)) {
        if (nowSec >= (brain.llmNextAtSec ?? 0)) thinkMockLLM(bot, brain, nowSec);
        steerBot(bot, brain, dt);
        continue;
      }
      if (brain.pendingInterrupt && nowSec >= brain.pendingInterrupt.dueAtSec) {
        thinkBot(bot, brain, nowSec);
      }
      if (nowSec >= (brain.nextThinkAtSec ?? 0)) thinkBot(bot, brain, nowSec);
      steerBot(bot, brain, dt);
    }
  },
});

for (const bot of bots) env.addUpdatable(bot);

env.addUpdatable({
  update() {
    if (!TEST_MODE) return;
    if (bots.length === 0) return;
    if (testCamMode === "off") return;

    const idx = clamp(testCamFocus | 0, 0, bots.length - 1);
    const focus = bots[idx];
    if (!focus?.head?.mesh) return;
    env.camera.position.copy(focus.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(focus.head.mesh.position.x, 0, focus.head.mesh.position.z);
    setShadowCenter(focus.head.mesh.position.x, focus.head.mesh.position.z);
  },
});

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
      const margin = headSize * 0.3;
      headPos.x = clamp(headPos.x + nx * penetration, -half + margin, half - margin);
      headPos.z = clamp(headPos.z + nz * penetration, -half + margin, half - margin);
      headPos.y = headSize / 2;
      if (p !== player) p.setLookDirFromMove(nx, nz);
      continue;
    }

    freeCubeSpawner.removeAt(i);
    p.enqueueTailValue(cubeValue);
    getStats(p).score += cubeValue;
  }
}

const tmpPush = new THREE.Vector3();
const tmpV3A = new THREE.Vector3();
const tmpV3B = new THREE.Vector3();
const tmpV3C = new THREE.Vector3();
const headHeadCooldown = new Map();
const tailTouchCooldown = new WeakMap();
function pairKey(a, b) {
  const au = a?.head?.mesh?.uuid ?? "";
  const bu = b?.head?.mesh?.uuid ?? "";
  return String(au) < String(bu) ? `${au}|${bu}` : `${bu}|${au}`;
}
function randomizeDir(nx, nz, amount) {
  const rx = nx + (Math.random() - 0.5) * amount;
  const rz = nz + (Math.random() - 0.5) * amount;
  const len = Math.sqrt(rx * rx + rz * rz) || 1;
  return { x: rx / len, z: rz / len };
}
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
            const contactGap = r + EXPLOSION.contactGap;
            const d2xz = dx * dx + dz * dz;
            if (d2xz >= contactGap * contactGap) continue;

            const segValue = seg.value ?? 0;
            if (segValue <= eaterValue) {
              dropTailFromIndex(owner, segIndex + 1);
              removeTailAt(owner, segIndex);
              eater.enqueueTailValue(segValue);
              getStats(eater).score += Math.max(0, segValue);
              eatenThisFrame += 1;
              if (eatenThisFrame >= 2) break;
              continue;
            }

            const dist = Math.sqrt(Math.max(1e-8, d2xz));
            const penetration = r - dist + 0.02;

            let nx = dx / dist;
            let nz = dz / dist;
            if (!Number.isFinite(nx) || !Number.isFinite(nz) || d2xz < 1e-8) {
              const dir = eater.headDirection;
              const l = Math.sqrt((dir?.x ?? 0) ** 2 + (dir?.z ?? 0) ** 2) || 1;
              nx = (dir?.x ?? 0) / l;
              nz = (dir?.z ?? 0) / l;
            }

            const half = mapSize / 2;
            const margin = eaterSize * 0.3;
            if (penetration > 0) {
              eaterPos.x = clamp(eaterPos.x + nx * penetration, -half + margin, half - margin);
              eaterPos.z = clamp(eaterPos.z + nz * penetration, -half + margin, half - margin);
              eaterPos.y = eaterSize / 2;
            }

            const now = performance.now() * 0.001;
            const last = tailTouchCooldown.get(eater) ?? -1e9;
            if (now - last > 0.08) {
              tailTouchCooldown.set(eater, now);
              const d = randomizeDir(nx, nz, 0.95);
              if (eater !== player) eater.setLookDirFromMove(d.x, d.z);
            }
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
        const contactGap = r + EXPLOSION.contactGap;
        if (d2 >= contactGap * contactGap || d2 < 1e-10) continue;

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
          addKillNotification(eater, victim);
          eliminateFromMatch(victim, eater);
          continue;
        }

        const dist = Math.sqrt(d2) || 1;
        const penetration = r - dist + 0.02;
        const nx = dx / dist;
        const nz = dz / dist;
        if (penetration > 0) {
          const impulse = Math.min(12, Math.max(0, penetration) * 26);
          a.addKnockback(-nx, -nz, impulse);
          b.addKnockback(nx, nz, impulse);
        }

        const now = performance.now() * 0.001;
        const key = pairKey(a, b);
        const last = headHeadCooldown.get(key) ?? -1e9;
        if (now - last > EXPLOSION.headHeadCooldownSec) {
          headHeadCooldown.set(key, now);
          const aPos = a.head.mesh.position;
          const bPos = b.head.mesh.position;
          const mx = (aPos.x + bPos.x) / 2;
          const mz = (aPos.z + bPos.z) / 2;
          const contact = Math.max(0, contactGap - dist);
          const intensity = 1.2 + Math.min(5.2, contact * 18);
          sparks.spawnBurst({ x: mx, y: 0.6, z: mz, intensity });

          a.applyExplosion(-nx, -nz, { speed: 10, stunSec: 1 });
          b.applyExplosion(nx, nz, { speed: 10, stunSec: 1 });
          const dirA = randomizeDir(-nx, -nz, 1.1 + intensity * 0.35);
          const dirB = randomizeDir(nx, nz, 1.1 + intensity * 0.35);
          if (a !== player) a.setLookDirFromMove(dirA.x, dirA.z);
          if (b !== player) b.setLookDirFromMove(dirB.x, dirB.z);
        }
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
    const focus = playerJoined ? player : spectatorFocus;
    if (!focus?.head?.mesh) return;
    env.camera.position.copy(focus.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(focus.head.mesh.position.x, 0, focus.head.mesh.position.z);
    setShadowCenter(focus.head.mesh.position.x, focus.head.mesh.position.z);
  },
});

env.renderer.domElement.addEventListener(
  "pointerdown",
  (e) => {
    if (!playerJoined) return;
    if (!e.isPrimary) return;
    if (e.pointerType !== "mouse") {
      pointerLookActive = true;
      pointerLookId = e.pointerId;
      env.renderer.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    updateLookFromClientXY(e.clientX, e.clientY);
  },
  { passive: false },
);

env.renderer.domElement.addEventListener(
  "pointermove",
  (e) => {
    if (!playerJoined) return;

    if (e.pointerType !== "mouse") {
      if (!pointerLookActive || e.pointerId !== pointerLookId) return;
      e.preventDefault();
      updateLookFromClientXY(e.clientX, e.clientY);
      return;
    }

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

    updateLookFromClientXY(e.clientX, e.clientY);
  },
  { passive: false },
);

env.renderer.domElement.addEventListener("pointerup", (e) => {
  if (e.pointerId !== pointerLookId) return;
  pointerLookActive = false;
  pointerLookId = -1;
});
env.renderer.domElement.addEventListener("pointercancel", (e) => {
  if (e.pointerId !== pointerLookId) return;
  pointerLookActive = false;
  pointerLookId = -1;
});

const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");
const startTitle = document.getElementById("startTitle");
const startHint = document.getElementById("startHint");
const endLeaderboardEl = document.getElementById("endLeaderboard");
const aliveCounterEl = document.getElementById("aliveCounter");
const killFeedEl = document.getElementById("killFeed");
const hudMatchInfoEl = document.getElementById("hudMatchInfo");

renderAliveCounter();
renderKillFeed();

env.addUpdatable({
  update() {
    renderAliveCounter();
    const nowSec = performance.now() * 0.001;
    if (matchActive && matchEndAtSec > 0 && nowSec >= matchEndAtSec) {
      endMatchByTime();
      return;
    }
    if (killFeed.length === 0) return;
    let changed = false;
    for (let i = killFeed.length - 1; i >= 0; i -= 1) {
      if (nowSec >= (killFeed[i]?.expiresAtSec ?? 0)) {
        killFeed.splice(i, 1);
        changed = true;
      }
    }
    if (changed) renderKillFeed();
  },
});

function setPaused(paused) {
  env.setPaused(paused);
}

function showStartOverlay() {
  if (startOverlay) startOverlay.style.display = "grid";
}

function hideStartOverlay() {
  if (startOverlay) startOverlay.style.display = "none";
}

function showEndOverlay(winnerOrOptions) {
  const winner = winnerOrOptions?.winner ?? winnerOrOptions;
  const reasonText = String(winnerOrOptions?.reasonText ?? "");
  if (startTitle) startTitle.textContent = "انتهت المباراة";
  if (startHint) {
    const winnerText = `الفائز: ${getPlayerName(winner)}`;
    startHint.textContent = reasonText ? `${reasonText} — ${winnerText}` : winnerText;
  }
  if (startButton) startButton.textContent = "إعادة";
  renderEndLeaderboard(winner);
  showStartOverlay();
}

function showStartOverlayDefault() {
  if (startTitle) startTitle.textContent = "ابدأ المباراة";
  if (startHint) startHint.textContent = "اضغط ابدأ أو اضغط Space";
  if (startButton) startButton.textContent = "ابدأ";
  clearEndLeaderboard();
}

function joinArena() {
  if (playerJoined) return;
  spectatorFocus = null;
  respawnPlayer(player, { avoid: players });
  if (player.head?.mesh) player.head.mesh.visible = true;
  player.eliminated = false;
  players.unshift(player);
  env.addUpdatable(player);
  cameraFollowOffset.copy(defaultCameraFollowOffset);
  env.camera.position.copy(player.head.mesh.position).add(cameraFollowOffset);
  env.camera.lookAt(player.head.mesh.position.x, 0, player.head.mesh.position.z);
  playerJoined = true;
}

function leaveArena(focus) {
  if (!playerJoined) return;
  playerJoined = false;
  spectatorFocus = focus ?? null;
  const idx = players.indexOf(player);
  if (idx >= 0) players.splice(idx, 1);
  if (env.updatables?.delete) env.updatables.delete(player);
  dropTailFromIndex(player, 0);
  if (typeof player.clearTail === "function") player.clearTail();
  if (player.head?.mesh) player.head.mesh.visible = false;
  pressed.clear();
  if (spectatorFocus?.head?.mesh) {
    env.camera.position.copy(spectatorFocus.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(spectatorFocus.head.mesh.position.x, 0, spectatorFocus.head.mesh.position.z);
    setShadowCenter(spectatorFocus.head.mesh.position.x, spectatorFocus.head.mesh.position.z);
  } else {
    env.camera.position.copy(defaultCameraPos);
    env.camera.lookAt(0, 0, 0);
    setShadowCenter(0, 0);
  }
  showStartOverlay();
}

function startGame() {
  setPaused(false);
  showStartOverlayDefault();
  hideStartOverlay();
  resetMatchWorld();
  joinArena();
}

if (!TEST_MODE) {
  if (startButton) startButton.addEventListener("click", startGame);
  if (startOverlay) startOverlay.addEventListener("pointerdown", (e) => {
    if (e.target === startOverlay) startGame();
  });
  addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") startGame();
  });
} else {
  hideStartOverlay();
  if (startOverlay) startOverlay.style.display = "none";
  if (startButton) startButton.style.display = "none";
  matchActive = true;
  addEventListener("keydown", (e) => {
    if (e.code === "Digit1") {
      testCamMode = "bot";
      testCamFocus = 0;
    }
    if (e.code === "Digit0") testCamMode = "off";
  });
}

env.start();
