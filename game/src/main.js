import { CubeFactory } from "./entities/CubeFactory.js";
import { Player } from "./entities/Player.js";
import { SceneEnvironment } from "./env/SceneEnvironment.js";
import { FreeCubeSpawner } from "./systems/FreeCubeSpawner.js";
import { GameMap } from "./world/GameMap.js";
import { THREE } from "./vendor/three.js";
import { createSparkManager } from "./render/sparks.js";
import { EXPLOSION } from "./config/explosion.js";
import geckos from "@geckos.io/client";
import { createNetCubesManager } from "./gameplay/netCubes.js";
import { createCollisionsSystem } from "./gameplay/collisionsSystem.js";
import { createNetSystem } from "./net/netSystem.js";
import { createLobbyUi } from "./ui/lobbyUi.js";
import { createBotsSystem } from "./ai/botsSystem.js";
import { createHudSystem } from "./ui/hudSystem.js";
import { createCameraSystem } from "./camera/cameraSystem.js";

const URL_PARAMS = new URLSearchParams(globalThis.location?.search ?? "");
const TEST_MODE = URL_PARAMS.get("test") === "1" || URL_PARAMS.get("test") === "true";
const NET_LOG_ENABLED =
  URL_PARAMS.get("netlog") === "1" || URL_PARAMS.get("netlog") === "true" || URL_PARAMS.get("debugnet") === "1";
const NET_CASE_ENABLED = NET_LOG_ENABLED && !(URL_PARAMS.get("netcase") === "0" || URL_PARAMS.get("netcase") === "false");
const NET_CASE_INTERVAL_MS = Math.max(500, Number(URL_PARAMS.get("netcaseMs") ?? 3000) || 3000);
const PROTO_AVAILABLE = typeof globalThis.protobuf?.parse === "function";
const MULTIPLAYER_ENABLED =
  !TEST_MODE &&
  typeof geckos === "function" &&
  PROTO_AVAILABLE &&
  !(URL_PARAMS.get("mp") === "0" || URL_PARAMS.get("mp") === "false");
const DEFAULT_BOT_COUNT = MULTIPLAYER_ENABLED ? 0 : 50;
const TEST_BOT_COUNT = TEST_MODE ? 1 : Math.max(0, Number(URL_PARAMS.get("bots") ?? DEFAULT_BOT_COUNT) || 0);
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

function halfBoundsFor(entity) {
  const b = entity?.movementBounds ?? currentMovementBounds;
  const hx = Number(b?.halfX) > 0 ? b.halfX : mapSize / 2;
  const hz = Number(b?.halfZ) > 0 ? b.halfZ : mapSize / 2;
  return { halfX: hx, halfZ: hz };
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
const mapSize = 64;
function normalizeArenaType(value) {
  return String(value ?? "default").trim().toLowerCase() || "default";
}
function movementBoundsForArena(arenaType, size) {
  const t = normalizeArenaType(arenaType);
  const s = Math.max(1, Number(size) || 1);
  if (t === "football" || t === "soccer") {
    const pitchW = s * 0.92;
    const targetAspect = 105 / 68;
    const pitchH = pitchW / targetAspect;
    return { halfX: pitchW / 2, halfZ: pitchH / 2 };
  }
  const half = s / 2;
  return { halfX: half, halfZ: half };
}
function loadArenaType() {
  try {
    return normalizeArenaType(localStorage.getItem("arena"));
  } catch {
    return "default";
  }
}
function saveArenaType(value) {
  const next = normalizeArenaType(value);
  try {
    localStorage.setItem("arena", next);
  } catch {
  }
  return next;
}
const arenaTypeFromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("arena");
let currentArenaType = normalizeArenaType(arenaTypeFromUrl ?? loadArenaType() ?? "default");
let currentMovementBounds = movementBoundsForArena(currentArenaType, mapSize);
let gameMap = new GameMap({ parent: env.scene, size: mapSize, arenaType: currentArenaType });
function applyArenaType(nextArenaType) {
  const next = saveArenaType(nextArenaType);
  currentArenaType = next;
  currentMovementBounds = movementBoundsForArena(next, mapSize);
  if (gameMap?.group?.parent) gameMap.group.parent.remove(gameMap.group);
  gameMap = new GameMap({ parent: env.scene, size: mapSize, arenaType: next });

  const all = [];
  if (player) all.push(player);
  if (Array.isArray(bots)) all.push(...bots);
  for (const p of all) {
    if (typeof p?.setMovementBounds === "function") p.setMovementBounds(currentMovementBounds);
  }
  if (typeof freeCubeSpawner?.setMovementBounds === "function") freeCubeSpawner.setMovementBounds(currentMovementBounds);
}
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
  movementBounds: currentMovementBounds,
  maxCount: Math.min(520, Math.round(mapSize * mapSize * 0.4)),
  spawnHeightMin: 6,
  spawnHeightMax: 12,
  fallSpeed: 8.5,
});
env.addUpdatable(freeCubeSpawner);

const { netCubes, clearNetCubes, spawnNetCube, removeNetCube } = createNetCubesManager({ freeCubeSpawner });

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
    if (!TEST_MODE) {
      showDeathOverlay({ killer });
    }
  }

  renderAliveCounter();

  if (!matchActive) return;
  if (players.length !== 1) return;
  const winner = players[0];
  const nowSec = performance.now() * 0.001;
  if (matchPendingEndAtSec > 0) return;
  matchPendingWinner = winner ?? null;
  matchPendingReasonText = "آخر لاعب";
  matchPendingEndAtSec = nowSec + 3;
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
    if (idx === 0) {
      row.style.background = "rgba(255, 215, 120, 0.14)";
      row.style.borderColor = "rgba(255, 215, 120, 0.25)";
      row.style.fontWeight = "950";
    }

    const left = document.createElement("div");
    left.className = "lbLeft";
    const winMark = e.p === winner ? " (الفائز)" : "";
    const outMark = e.eliminated ? " (خرج)" : "";
    left.textContent = `${idx + 1}) ${e.name}${winMark}${outMark}`;
    if (idx === 0) {
      left.style.fontFamily = `"Arial Black", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      left.style.letterSpacing = "0.2px";
    }

    const right = document.createElement("div");
    right.className = "lbRight";
    right.textContent = `${e.value} • قتلات: ${e.kills}`;
    if (idx === 0) {
      right.style.fontFamily = `"Arial Black", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    }

    row.append(left, right);
    return row;
  });

  endLeaderboardEl.replaceChildren(title, ...rows);
}

function endMatch({ winner, reasonText = "" } = {}) {
  if (!winner || !matchActive) return;
  matchActive = false;
  matchEndAtSec = 0;
  matchPendingEndAtSec = 0;
  matchPendingWinner = null;
  matchPendingReasonText = "";

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

function resetMatchWorld() {
  matchActive = true;
  spectatorFocus = null;
  matchTotalPlayers = MULTIPLAYER_ENABLED ? 0 : bots.length + 1;
  killFeed.length = 0;
  matchEndAtSec = performance.now() * 0.001 + MATCH_DURATION_SEC;
  matchPendingEndAtSec = 0;
  matchPendingWinner = null;
  matchPendingReasonText = "";

  players.length = 0;
  if (!MULTIPLAYER_ENABLED) {
    for (const bot of bots) {
      bot.eliminated = false;
      if (bot.head?.mesh) bot.head.mesh.visible = true;
      respawnPlayer(bot, { avoid: players });
      env.addUpdatable(bot);
      players.push(bot);
    }
  }

  const pIdx = players.indexOf(player);
  if (pIdx >= 0) players.splice(pIdx, 1);
  if (env.updatables?.delete) env.updatables.delete(player);
  if (typeof player.clearTail === "function") player.clearTail();
  if (player.head?.mesh) player.head.mesh.visible = false;
  player.eliminated = false;
  playerJoined = false;
  pressed.clear();

  clearNetCubes();
  renderAliveCounter();
  renderKillFeed();
  clearEndLeaderboard();
}

function dropSegmentAsFreeCube(seg) {
  if (MULTIPLAYER_ENABLED) return;
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
  const code = typeof e?.code === "string" ? e.code : typeof e?.key === "string" ? e.key : "";
  if (code.startsWith("Arrow")) e.preventDefault();
  if (code) pressed.add(code);
});
addEventListener("keyup", (e) => {
  const code = typeof e?.code === "string" ? e.code : typeof e?.key === "string" ? e.key : "";
  if (code.startsWith("Arrow")) e.preventDefault();
  if (code) pressed.delete(code);
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

  const { halfX: half, halfZ: halfZ } = halfBoundsFor(player);
  const margin = (player?.head?.size ?? 0) * 0.3;
  const x = clamp(clickPoint.x, -half + margin, half - margin);
  const z = clamp(clickPoint.z, -halfZ + margin, halfZ - margin);

  const dx = x - player.head.mesh.position.x;
  const dz = z - player.head.mesh.position.z;
  player.setLookDirFromMove(dx, dz);
}

function chooseSpawnXZ({ mapSize, bounds, radius, avoid = [], avoidDist = 5.5, tries = 60 } = {}) {
  const halfX = Number(bounds?.halfX) > 0 ? bounds.halfX : mapSize / 2;
  const halfZ = Number(bounds?.halfZ) > 0 ? bounds.halfZ : mapSize / 2;
  const margin = radius;
  const minX = -halfX + margin;
  const maxX = halfX - margin;
  const minZ = -halfZ + margin;
  const maxZ = halfZ - margin;
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
    bounds: p?.movementBounds ?? currentMovementBounds,
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

function respawnPlayerAt(p, spawn) {
  if (!p || !spawn) return;
  const spawnValue = 2;
  p.setHeadValue(spawnValue);
  p.clearTail();
  const s = statsByPlayer.get(p);
  if (s) {
    s.score = 0;
    s.kills = 0;
    s.lastHeadValue = spawnValue;
  }
  const x = Number(spawn?.x) || 0;
  const z = Number(spawn?.z) || 0;
  p.setPosition(x, p.head.size / 2, z);
  const dx = Number(spawn?.dx) || 0;
  const dz = Number(spawn?.dz) || 0;
  p.setLookDirFromMove(dx, dz);
}

function spawnInFrontOfPlayer(p, forwardX, forwardZ, { distMin = 8, distMax = 14, spread = 6 } = {}) {
  const halfX = Number(p?.movementBounds?.halfX) > 0 ? p.movementBounds.halfX : mapSize / 2;
  const halfZ = Number(p?.movementBounds?.halfZ) > 0 ? p.movementBounds.halfZ : mapSize / 2;
  const margin = p.head.size / 2;
  const dist = randomBetween(distMin, distMax);
  const perpX = -forwardZ;
  const perpZ = forwardX;
  const lateral = randomBetween(-spread, spread);
  const x = clamp(p.head.mesh.position.x + forwardX * dist + perpX * lateral, -halfX + margin, halfX - margin);
  const z = clamp(p.head.mesh.position.z + forwardZ * dist + perpZ * lateral, -halfZ + margin, halfZ - margin);
  p.setPosition(x, p.head.size / 2, z);
  p.setLookDirFromMove(-forwardX, -forwardZ);
}

const baseSpeedAt2 = 2.6;
function normalizeUserName(value) {
  const raw = String(value ?? "");
  const cleaned = raw.replace(/\s+/g, " ").replace(/[\r\n\t]/g, " ").trim();
  const limited = cleaned.slice(0, 18);
  return limited;
}

function loadUserName() {
  try {
    return normalizeUserName(localStorage.getItem("username"));
  } catch {
    return "";
  }
}

function saveUserName(name) {
  const next = normalizeUserName(name);
  try {
    localStorage.setItem("username", next);
  } catch {
  }
  return next;
}

const initialUserName = loadUserName() || "Player";
const player = new Player({
  cubeFactory,
  parent: env.scene,
  mapSize,
  movementBounds: currentMovementBounds,
  name: initialUserName,
  speed: baseSpeedAt2,
  tailLength: 0,
  headLevel: 1,
});
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
let matchPendingEndAtSec = 0;
let matchPendingWinner = null;
let matchPendingReasonText = "";
const killFeed = [];

getStats(player);

const hudBoard = document.getElementById("hudBoard");
let hudSystem = null;

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
    const x0 = edgePad + u * usable;
    const y0 = edgePad + (1 - v) * usable;
    return { x: y0, y: x0 };
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
  const remotes = MULTIPLAYER_ENABLED ? Array.from(netState.remotes.values()).map((e) => e.player) : [];
  const allPlayers = remotes.length > 0 ? list.concat(remotes) : list;
  for (const p of allPlayers) {
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
const netCollectLastAtMs = new Map();

const net = createNetSystem({
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  protoAvailable: PROTO_AVAILABLE,
  urlParams: URL_PARAMS,
  netLogEnabled: NET_LOG_ENABLED,
  netCaseEnabled: NET_CASE_ENABLED,
  netCaseIntervalMs: NET_CASE_INTERVAL_MS,
  THREE,
  env,
  player,
  players,
  Player,
  cubeFactory,
  mapSize,
  getCurrentMovementBounds: () => currentMovementBounds,
  baseSpeedAt2,
  getPlayerJoined: () => playerJoined,
  getMatchActive: () => matchActive,
  setFreeCubeSpawnerEnabled: (enabled) => {
    freeCubeSpawner.enabled = enabled;
  },
  spawnNetCube,
  removeNetCube,
  clearNetCubes,
  netCollectLastAtMs,
  getPlayerName,
  getStats,
});

const netState = net.netState;
const netLog = net.netLog;
const ensureRemotePlayer = net.ensureRemotePlayer;
const netRequestRoomsList = net.netRequestRoomsList;
const netCreateRoom = net.netCreateRoom;
const netJoinExistingRoom = net.netJoinExistingRoom;
const netStartRoom = net.netStartRoom;
const netLeaveRoom = net.netLeaveRoom;

hudSystem = createHudSystem({
  hudBoard,
  players,
  netState,
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  getStats,
  getPlayerName,
});

env.addUpdatable({ update: (dt) => net.update(dt) });

const botCount = TEST_BOT_COUNT;
const cameraSystem = createCameraSystem({
  env,
  player,
  bots,
  clamp,
  setShadowCenter,
  cameraFollowOffset,
  defaultCameraPos,
  testMode: TEST_MODE,
});
cameraSystem.bindTestControls();

env.addUpdatable({
  update() {
    if (cameraSystem.updateTestCamera()) return;
    cameraSystem.updateFollowCamera({ playerJoined, spectatorFocus });
  },
});

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
    movementBounds: currentMovementBounds,
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

const botsSystem = createBotsSystem({
  THREE,
  TEST_MODE,
  TEST_LOG,
  LLM_BOT_INDEX,
  bots,
  players,
  freeCubeSpawner,
  clamp,
  clamp01,
  randomBetween,
  randomSign,
  halfBoundsFor,
  getPlayerName,
});

env.addUpdatable({ update: (dt, t) => botsSystem.updateBots(dt, t) });

for (const bot of bots) env.addUpdatable(bot);

const collisions = createCollisionsSystem({
  THREE,
  EXPLOSION,
  sparks,
  players,
  player,
  freeCubeSpawner,
  halfBoundsFor,
  clamp,
  getStats,
  dropTailFromIndex,
  removeTailAt,
  addKillNotification,
  eliminateFromMatch,
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  getPlayerJoined: () => playerJoined,
  net,
});

env.addUpdatable({ update: () => collisions.update() });

env.addUpdatable({ update: () => hudSystem.update() });

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
const startTitle = document.getElementById("startTitle");
const startHint = document.getElementById("startHint");
const nameRow = document.getElementById("nameRow");
const nameInput = document.getElementById("nameInput");
const stepName = document.getElementById("stepName");
const stepRooms = document.getElementById("stepRooms");
const stepLobby = document.getElementById("stepLobby");
const continueBtn = document.getElementById("continueBtn");
const roomsListEl = document.getElementById("roomsList");
const refreshRoomsBtn = document.getElementById("refreshRoomsBtn");
const toggleCreateRoomBtn = document.getElementById("toggleCreateRoomBtn");
const createRoomDetails = document.getElementById("createRoomDetails");
const roomIdInput = document.getElementById("roomIdInput");
const maxPlayersInput = document.getElementById("maxPlayersInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const cancelCreateRoomBtn = document.getElementById("cancelCreateRoomBtn");
const lobbyInfoEl = document.getElementById("lobbyInfo");
const lobbyPlayersEl = document.getElementById("lobbyPlayers");
const startMatchBtn = document.getElementById("startMatchBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const arenaRow = document.getElementById("arenaRow");
const arenaButtons = Array.from(arenaRow?.querySelectorAll?.("[data-arena]") ?? []);
const endLeaderboardEl = document.getElementById("endLeaderboard");
const aliveCounterEl = document.getElementById("aliveCounter");
const killFeedEl = document.getElementById("killFeed");
const hudMatchInfoEl = document.getElementById("hudMatchInfo");
const lobbyUi = createLobbyUi({
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  netState,
  player,
  normalizeUserName,
  normalizeArenaType,
  loadUserName,
  saveUserName,
  setPaused,
  clearEndLeaderboard,
  netRequestRoomsList,
  netJoinExistingRoom,
  netCreateRoom,
  netStartRoom,
  netLeaveRoom,
  startGameSingleplayer: (t) => startGame(t),
  currentArenaType,
  elements: {
    startOverlay,
    startTitle,
    startHint,
    nameInput,
    stepName,
    stepRooms,
    stepLobby,
    continueBtn,
    roomsListEl,
    refreshRoomsBtn,
    toggleCreateRoomBtn,
    createRoomDetails,
    roomIdInput,
    maxPlayersInput,
    createRoomBtn,
    cancelCreateRoomBtn,
    lobbyInfoEl,
    lobbyPlayersEl,
    startMatchBtn,
    leaveRoomBtn,
    arenaButtons,
  },
});

function startMatchFromRoom(payload) {
  if (!payload?.roomId) return;
  const arenaType = normalizeArenaType(payload?.arenaType ?? lobbyUi.getSelectedArenaType());
  const playersList = Array.isArray(payload?.players) ? payload.players : [];
  for (const p of playersList) {
    const id = String(p?.id ?? "");
    const num = Number(p?.num) || 0;
    if (!id || id === netState.playerId) continue;
    ensureRemotePlayer({ id, num, name: p?.name });
  }
  if (!netState.playerNum) {
    const me = playersList.find((p) => String(p?.id ?? "") === String(netState.playerId ?? ""));
    if (me && Number.isFinite(Number(me.num))) netState.playerNum = Number(me.num) || null;
  }
  const spawns = Array.isArray(payload?.spawns) ? payload.spawns : [];
  const mySpawn = netState.playerNum ? spawns.find((s) => Number(s?.num) === netState.playerNum) : null;

  applyArenaType(arenaType);
  lobbyUi.setArenaSelection(arenaType);
  lobbyUi.hideStartOverlay();
  setPaused(false);

  net.onMatchStarted(payload);

  resetMatchWorld();
  matchTotalPlayers = playersList.length > 0 ? playersList.length : 1 + netState.remotes.size;
  joinArena(mySpawn);

  for (const entry of netState.remotes.values()) {
    const p = entry?.player;
    if (!p) continue;
    if (typeof p.clearTail === "function") p.clearTail();
    p.setHeadValue(2);
    p.eliminated = false;
    if (p.head?.mesh) p.head.mesh.visible = true;
    const spawn = entry.num ? spawns.find((s) => Number(s?.num) === entry.num) : null;
    if (spawn) {
      p.setPosition(Number(spawn.x) || 0, p.head.size / 2, Number(spawn.z) || 0);
      p.setLookDirFromMove(Number(spawn.dx) || 0, Number(spawn.dz) || 0);
    }
    if (!players.includes(p)) players.push(p);
    env.addUpdatable(p);
  }
  renderAliveCounter();
}
lobbyUi.bind();

net.setHandlers({
  onRoomsList: lobbyUi.renderRoomsList,
  onLobbyState: lobbyUi.renderLobby,
  onRoomStarted: startMatchFromRoom,
  onRoomError: (message) => lobbyUi.setStartHintText(message),
});

lobbyUi.showStartOverlayDefault();

renderAliveCounter();
renderKillFeed();

env.addUpdatable({
  update() {
    renderAliveCounter();
    const nowSec = performance.now() * 0.001;
    if (matchActive && matchPendingEndAtSec > 0 && nowSec >= matchPendingEndAtSec) {
      const winner = matchPendingWinner ?? players?.[0] ?? null;
      const reasonText = matchPendingReasonText || "آخر لاعب";
      matchPendingEndAtSec = 0;
      matchPendingWinner = null;
      matchPendingReasonText = "";
      if (winner) endMatch({ winner, reasonText });
      return;
    }
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

function showEndOverlay(winnerOrOptions) {
  const winner = winnerOrOptions?.winner ?? winnerOrOptions;
  const reasonText = String(winnerOrOptions?.reasonText ?? "");
  if (startTitle) startTitle.textContent = "انتهت المباراة";
  const winnerText = `الفائز: ${getPlayerName(winner)}`;
  lobbyUi.setStartHintText(reasonText ? `${reasonText} — ${winnerText}` : winnerText);
  renderEndLeaderboard(winner);
  netLeaveRoom();
  setPaused(true);
  const hasName = Boolean(loadUserName());
  lobbyUi.setStepVisible(hasName && MULTIPLAYER_ENABLED ? "rooms" : "name");
  lobbyUi.updateStartGateUI();
  lobbyUi.showStartOverlay();
  if (MULTIPLAYER_ENABLED) netRequestRoomsList();
}

function showDeathOverlay({ killer } = {}) {
  if (startTitle) startTitle.textContent = "لقد خسرت";
  const killerName = killer ? getPlayerName(killer) : "";
  lobbyUi.setStartHintText(killerName ? `قتلك: ${killerName}` : "تمت إزالتك");
  clearEndLeaderboard();
  netLeaveRoom();
  setPaused(true);
  const hasName = Boolean(loadUserName());
  lobbyUi.setStepVisible(hasName && MULTIPLAYER_ENABLED ? "rooms" : "name");
  lobbyUi.updateStartGateUI();
  lobbyUi.showStartOverlay();
  if (MULTIPLAYER_ENABLED) netRequestRoomsList();
}

function joinArena(spawn) {
  if (playerJoined) return;
  spectatorFocus = null;
  if (MULTIPLAYER_ENABLED && spawn) respawnPlayerAt(player, spawn);
  else respawnPlayer(player, { avoid: players });
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
  lobbyUi.showStartOverlay();
}

function startGame(nextArenaType) {
  const inputName = lobbyUi.getCurrentUserNameInput();
  if (!inputName) {
    lobbyUi.setStartHintText("لازم تدخل User name الأول");
    if (nameInput?.focus) nameInput.focus();
    lobbyUi.updateStartGateUI();
    return;
  }
  const nextName = saveUserName(inputName);
  player.setName(nextName);
  applyArenaType(nextArenaType ?? currentArenaType);
  lobbyUi.setArenaSelection(currentArenaType);
  setPaused(false);
  lobbyUi.showStartOverlayDefault();
  lobbyUi.hideStartOverlay();
  resetMatchWorld();
  joinArena();
}

if (!TEST_MODE) {
} else {
  lobbyUi.hideStartOverlay();
  if (startOverlay) startOverlay.style.display = "none";
  matchActive = true;
}

env.start();
