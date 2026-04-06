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
import { createSpawnSystem } from "./gameplay/spawnSystem.js";
import { createTailSystem } from "./gameplay/tailSystem.js";
import { createMatchSystem } from "./gameplay/matchSystem.js";
import { createSessionSystem } from "./gameplay/sessionSystem.js";
import { createNetSystem } from "./net/netSystem.js";
import { createVoiceChatSystem } from "./net/voiceChatSystem.js";
import { createLobbyUi } from "./ui/lobbyUi.js";
import { createBotsSystem } from "./ai/botsSystem.js";
import { createHudSystem } from "./ui/hudSystem.js";
import { installMinimap } from "./ui/minimapSystem.js";
import { createCameraSystem } from "./camera/cameraSystem.js";
import { normalizeUserName, loadUserName, saveUserName } from "./ui/userProfile.js";
import { clamp, clamp01 } from "./utils/math.js";
import { randomBetween, randomSign } from "./utils/random.js";
import { createBrain } from "./ai/brainFactory.js";
import { getPlayerName } from "./gameplay/playerIdentity.js";
import { createPlayerStatsStore } from "./gameplay/playerStats.js";
import { createLookControls } from "./input/lookControls.js";
import { normalizeArenaType, movementBoundsForArena, loadArenaType, saveArenaType } from "./world/arenaUtils.js";

// =========================
// إعدادات التشغيل (URL Params)
// =========================
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

// =========================
// Helpers صغيرة عامة
// =========================
function halfBoundsFor(entity) {
  const b = entity?.movementBounds ?? currentMovementBounds;
  const hx = Number(b?.halfX) > 0 ? b.halfX : mapSize / 2;
  const hz = Number(b?.halfZ) > 0 ? b.halfZ : mapSize / 2;
  return { halfX: hx, halfZ: hz };
}

// Store لستاتس اللاعبين (score/level/…)
const { getStats } = createPlayerStatsStore();

// =========================
// تهيئة الـ Scene/Environment
// =========================
const env = new SceneEnvironment();
if (env.renderer?.domElement) {
  env.renderer.domElement.style.touchAction = "none";
  env.renderer.domElement.style.userSelect = "none";
  env.renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
}

// =========================
// تهيئة الـ Arena + Movement Bounds
// =========================
const mapSize = 64;
const arenaTypeFromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("arena");
let currentArenaType = normalizeArenaType(arenaTypeFromUrl ?? loadArenaType() ?? "default");
let currentMovementBounds = movementBoundsForArena(currentArenaType, mapSize);
let gameMap = new GameMap({ parent: env.scene, size: mapSize, arenaType: currentArenaType });

// تغيير الـ Arena (إعادة بناء الخريطة + تحديث الحدود للاعبين والـ spawner)
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

// =========================
// إعدادات الظلال (Shadow)
// =========================
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

// =========================
// Factories / Effects
// =========================
const cubeFactory = new CubeFactory({ maxLevel: 21 });

const sparks = createSparkManager(env.scene);
env.addUpdatable(sparks);

// =========================
// Free Cubes (Singleplayer) + Net Cubes (Multiplayer)
// =========================
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

// =========================
// أنظمة الـ Gameplay الأساسية: Tail / Match
// =========================
const MATCH_DURATION_SEC = 3600;

const tailSystem = createTailSystem({ freeCubeSpawner, multiplayerEnabled: MULTIPLAYER_ENABLED });
const { removeTailAt, dropTailFromIndex } = tailSystem;

// Placeholders بيتعبّوا بعد ما نعمل createMatchSystem
let matchSystem = null;
let eliminateFromMatch = () => {};
let addKillNotification = () => {};
let renderKillFeed = () => {};
let renderAliveCounter = () => {};
let clearEndLeaderboard = () => {};
let resetMatchWorld = () => {};
let endMatchByTime = () => {};
let endMatch = () => {};

// =========================
// Input: Keyboard (pressed Set)
// =========================
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

// Helpers لتوجيه الحركة بناءً على اتجاه الكاميرا
const lookRightWorld = new THREE.Vector3();
const lookUpWorld = new THREE.Vector3();
const lookVec = new THREE.Vector3();
let lastMoveKey = "";

// =========================
// Spawn System (أماكن respawn/placement)
// =========================
const spawnSystem = createSpawnSystem({
  mapSize,
  getCurrentMovementBounds: () => currentMovementBounds,
  randomBetween,
  clamp,
  getStats,
});
const { placePlayer, respawnPlayer, respawnPlayerAt, spawnInFrontOfPlayer } = spawnSystem;

const baseSpeedAt2 = 2.6;

// =========================
// إنشاء اللاعب المحلي + Camera defaults
// =========================
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

// =========================
// Runtime State (مشترك بين السيستمز)
// =========================
let playerJoined = false;
let spectatorFocus = null;
let matchActive = false;
let matchTotalPlayers = 0;
let matchEndAtSec = 0;
let matchPendingEndAtSec = 0;
let matchPendingWinner = null;
let matchPendingReasonText = "";

// =========================
// Look Controls (Mouse/Touch لتوجيه النظر)
// =========================
const lookControls = createLookControls({
  THREE,
  env,
  player,
  getPlayerJoined: () => playerJoined,
  halfBoundsFor,
  clamp,
  pressed,
});
lookControls.bind();

getStats(player);

// =========================
// HUD + Players Collections
// =========================
const hudBoard = document.getElementById("hudBoard");
const voiceToggleBtn = document.getElementById("voiceToggleBtn");
const voiceMuteBtn = document.getElementById("voiceMuteBtn");
const voiceStatusEl = document.getElementById("voiceStatus");
let hudSystem = null;

const bots = [];
const players = [];
const netCollectLastAtMs = new Map();

// =========================
// Networking (Multiplayer) + Remote Players
// =========================
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

const voiceChat = createVoiceChatSystem({
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  netState,
  ensureChannel: net.ensureChannel,
});
env.addUpdatable({ update: () => voiceChat.update() });

function renderVoiceHud() {
  if (!voiceToggleBtn) return;
  const s = voiceChat.getState();
  voiceToggleBtn.disabled = !MULTIPLAYER_ENABLED || !s.supported;
  voiceToggleBtn.textContent = s.enabled ? "إيقاف الشات الصوتي" : "تفعيل الشات الصوتي";
  if (voiceMuteBtn) {
    voiceMuteBtn.style.display = s.enabled ? "" : "none";
    voiceMuteBtn.textContent = s.micMuted ? "تشغيل المايك" : "كتم المايك";
  }
  if (voiceStatusEl) {
    const peersText = s.enabled ? ` — متصلين صوت: ${s.peers}` : "";
    voiceStatusEl.textContent = s.status ? `${s.status}${peersText}` : s.enabled ? `الصوت شغال${peersText}` : "";
  }
}

if (voiceToggleBtn) {
  voiceToggleBtn.addEventListener(
    "click",
    async () => {
      const s = voiceChat.getState();
      if (s.enabled) voiceChat.disable();
      else await voiceChat.enable();
      renderVoiceHud();
    },
    { passive: false },
  );
}

if (voiceMuteBtn) {
  voiceMuteBtn.addEventListener(
    "click",
    () => {
      const s = voiceChat.getState();
      voiceChat.setMicMuted(!s.micMuted);
      renderVoiceHud();
    },
    { passive: true },
  );
}

let lastVoiceHudAtMs = 0;
env.addUpdatable({
  update: () => {
    const nowMs = performance.now();
    if (nowMs - (lastVoiceHudAtMs || 0) < 250) return;
    lastVoiceHudAtMs = nowMs;
    renderVoiceHud();
  },
});

// HUD بيعرض info سواء Multiplayer أو Singleplayer
hudSystem = createHudSystem({
  hudBoard,
  players,
  netState,
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  getStats,
  getPlayerName,
});

// MiniMap optional حسب URL param
installMinimap({
  enabled: MINIMAP_ENABLED,
  env,
  mapSize,
  clamp,
  clamp01,
  freeCubeSpawner,
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  getPlayers: () => players,
  getRemotes: () => Array.from(netState?.remotes?.values?.() ?? []).map((e) => e.player),
  getLocalPlayer: () => player,
  getLocalJoined: () => playerJoined,
});

// net system update
env.addUpdatable({ update: (dt) => net.update(dt) });

// =========================
// Camera System
// =========================
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

// =========================
// إنشاء Bots (Singleplayer/TEST)
// =========================
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
  bot.ai = createBrain({ botKillAll: BOT_KILL_ALL, llmMode: LLM_MODE });
  bots.push(bot);
  players.push(bot);
  placePlayer(bot, { avoid: players.filter((p) => p !== bot) });
}

// =========================
// تحويل WASD/Arrows لاتجاه حركة فعلي في العالم (حسب الكاميرا)
// =========================
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

// =========================
// Bots System (AI) Update Loop
// =========================
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

// =========================
// Lobby UI Elements + Wiring
// =========================
const startOverlay = document.getElementById("startOverlay");
const startTitle = document.getElementById("startTitle");
const startHint = document.getElementById("startHint");
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
let sessionSystem = null;

// UI بتاع الـ Lobby بيستدعي callbacks للـ Net/Solo
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
  startGameSingleplayer: (t) => sessionSystem?.startGame(t),
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

// =========================
// Match System (منطق المباراة/الـ HUD overlays/النهاية)
// =========================
matchSystem = createMatchSystem({
  env,
  player,
  bots,
  players,
  pressed,
  lobbyUi,
  netLeaveRoom,
  netRequestRoomsList,
  clearNetCubes,
  getStats,
  getPlayerName,
  respawnPlayer,
  multiplayerEnabled: MULTIPLAYER_ENABLED,
  testMode: TEST_MODE,
  matchDurationSec: MATCH_DURATION_SEC,
  elements: {
    killFeedEl,
    hudMatchInfoEl,
    aliveCounterEl,
    endLeaderboardEl,
    startTitle,
    loadUserName,
    dropTailFromIndex,
  },
  getMatchActive: () => matchActive,
  setMatchActive: (v) => {
    matchActive = Boolean(v);
  },
  getMatchTotalPlayers: () => matchTotalPlayers,
  setMatchTotalPlayers: (v) => {
    matchTotalPlayers = Number(v) || 0;
  },
  getMatchEndAtSec: () => matchEndAtSec,
  setMatchEndAtSec: (v) => {
    matchEndAtSec = Number(v) || 0;
  },
  getMatchPendingEndAtSec: () => matchPendingEndAtSec,
  setMatchPendingEndAtSec: (v) => {
    matchPendingEndAtSec = Number(v) || 0;
  },
  getMatchPendingWinner: () => matchPendingWinner,
  setMatchPendingWinner: (v) => {
    matchPendingWinner = v ?? null;
  },
  getMatchPendingReasonText: () => matchPendingReasonText,
  setMatchPendingReasonText: (v) => {
    matchPendingReasonText = String(v ?? "");
  },
  getPlayerJoined: () => playerJoined,
  setPlayerJoined: (v) => {
    playerJoined = Boolean(v);
  },
  setSpectatorFocus: (v) => {
    spectatorFocus = v ?? null;
  },
});

// نعيد توجيه دوال الماتش الأساسية للـ main عشان أنظمة تانية تستخدمها (زي collisions)
eliminateFromMatch = matchSystem.eliminateFromMatch;
addKillNotification = matchSystem.addKillNotification;
renderKillFeed = matchSystem.renderKillFeed;
renderAliveCounter = matchSystem.renderAliveCounter;
clearEndLeaderboard = matchSystem.clearEndLeaderboard;
resetMatchWorld = matchSystem.resetMatchWorld;
endMatchByTime = matchSystem.endMatchByTime;
endMatch = matchSystem.endMatch;

// =========================
// Session System (Join/Leave/Start) - متعمد يبقى خارج main
// =========================
sessionSystem = createSessionSystem({
  env,
  player,
  players,
  pressed,
  lobbyUi,
  nameInput,
  setPaused,
  saveUserName,
  applyArenaType,
  getCurrentArenaType: () => currentArenaType,
  setArenaSelection: (v) => lobbyUi.setArenaSelection(v),
  respawnPlayer,
  respawnPlayerAt,
  dropTailFromIndex,
  clearTailAndHide: () => {
    if (typeof player.clearTail === "function") player.clearTail();
    if (player.head?.mesh) player.head.mesh.visible = false;
  },
  defaultCameraPos,
  defaultCameraFollowOffset,
  cameraFollowOffset,
  setShadowCenter,
  getPlayerJoined: () => playerJoined,
  setPlayerJoined: (v) => {
    playerJoined = Boolean(v);
  },
  getSpectatorFocus: () => spectatorFocus,
  setSpectatorFocus: (v) => {
    spectatorFocus = v ?? null;
  },
  resetMatchWorld,
  multiplayerEnabled: MULTIPLAYER_ENABLED,
});

// =========================
// Collisions System (اصطدامات/قتل/جمع cubes)
// =========================
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

// =========================
// Main Update Loop: ربط السيستمز بالـ env
// =========================
env.addUpdatable({ update: () => collisions.update() });
env.addUpdatable({ update: () => hudSystem.update() });
env.addUpdatable({ update: () => matchSystem.tick() });

// =========================
// Multiplayer: بدء الماتش من الـ Room payload
// =========================
function startMatchFromRoom(payload) {
  if (!payload?.roomId) return;
  const arenaType = normalizeArenaType(payload?.arenaType ?? lobbyUi.getSelectedArenaType());
  const playersList = Array.isArray(payload?.players) ? payload.players : [];

  // 1) تأكد إن كل اللاعبين الـ remotes موجودين محليًا (entities) قبل ما نبدأ
  for (const p of playersList) {
    const id = String(p?.id ?? "");
    const num = Number(p?.num) || 0;
    if (!id || id === netState.playerId) continue;
    ensureRemotePlayer({ id, num, name: p?.name });
  }

  // 2) ثبت رقمك داخل الـ room (playerNum) لو مش موجود
  if (!netState.playerNum) {
    const me = playersList.find((p) => String(p?.id ?? "") === String(netState.playerId ?? ""));
    if (me && Number.isFinite(Number(me.num))) netState.playerNum = Number(me.num) || null;
  }

  // 3) اختار spawn بتاعك لو السيرفر بعته
  const spawns = Array.isArray(payload?.spawns) ? payload.spawns : [];
  const mySpawn = netState.playerNum ? spawns.find((s) => Number(s?.num) === netState.playerNum) : null;

  // 4) فعّل الـ Arena/UI + شغّل اللعب
  applyArenaType(arenaType);
  lobbyUi.setArenaSelection(arenaType);
  lobbyUi.hideStartOverlay();
  setPaused(false);

  // 5) مرّر snapshot البداية للـ net system (cubes/seed/…)
  net.onMatchStarted(payload);

  // 6) reset لمباراة جديدة + join اللاعب المحلي
  resetMatchWorld();
  matchTotalPlayers = playersList.length > 0 ? playersList.length : 1 + netState.remotes.size;
  sessionSystem?.joinArena(mySpawn);
  try {
    netState.channel?.emit?.("client:started", {
      roomId: payload.roomId,
      playerNum: netState.playerNum,
      joined: Boolean(playerJoined),
      paused: Boolean(env.paused),
    });
  } catch {
  }

  // 7) جهّز كل اللاعبين الآخرين (remotes) واضفهم للـ update loop
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

// =========================
// ربط UI/Net handlers + Start overlay
// =========================
lobbyUi.bind();

function getPlayerByNum(num) {
  const n = Number(num) || 0;
  if (!n) return null;
  if (netState.playerNum && n === netState.playerNum) return player;
  return netState.remotesByNum.get(n)?.player ?? null;
}

net.setHandlers({
  onRoomsList: lobbyUi.renderRoomsList,
  onLobbyState: lobbyUi.renderLobby,
  onRoomStarted: startMatchFromRoom,
  onRoomError: (message) => lobbyUi.setStartHintText(message),
  onPvpEliminate: (payload) => {
    const killerNum = Number(payload?.killerNum) || 0;
    const victimNum = Number(payload?.victimNum) || 0;
    if (!killerNum || !victimNum || killerNum === victimNum) return;
    const killer = getPlayerByNum(killerNum);
    const victim = getPlayerByNum(victimNum);
    if (!killer || !victim) return;
    if (!killer.head?.mesh || !victim.head?.mesh) return;

    const victimValue = victim.head.value ?? 0;
    killer.enqueueTailValue(victimValue);
    const killerStats = getStats(killer);
    killerStats.kills += 1;
    killerStats.score += Math.max(0, victimValue) * 2;
    addKillNotification(killer, victim);

    const resetValue = Math.max(1, Number(payload?.resetValue) || 2);
    const respawnDelayMs = Math.max(0, Math.min(10000, Number(payload?.respawnDelayMs) || 0));
    const respawn = payload?.respawn ?? null;

    victim.eliminated = true;
    if (typeof victim.clearTail === "function") victim.clearTail();
    if (victim.head?.mesh) victim.head.mesh.visible = false;

    const idx = players.indexOf(victim);
    if (idx >= 0) players.splice(idx, 1);
    if (env.updatables?.delete) env.updatables.delete(victim);

    if (victim === player) {
      playerJoined = false;
      pressed.clear();
    }

    globalThis.setTimeout(() => {
      const victimStats = getStats(victim);
      if (victimStats) victimStats.lastHeadValue = resetValue;
      victim.setHeadValue(resetValue);
      victim.eliminated = false;
      if (victim.head?.mesh) victim.head.mesh.visible = true;

      if (victim.isRemote) {
        const entry = netState.remotesByNum.get(Number(victimNum) || 0);
        if (entry) {
          entry.forceHv = resetValue;
          entry.forceHvUntilMs = performance.now() + 1500;
        }
      }

      if (respawn) {
        victim.setPosition(Number(respawn.x) || 0, victim.head.size / 2, Number(respawn.z) || 0);
        victim.setLookDirFromMove(Number(respawn.dx) || 0, Number(respawn.dz) || 0);
      }

      if (!players.includes(victim)) players.push(victim);
      env.addUpdatable(victim);
      if (victim === player) playerJoined = true;
    }, respawnDelayMs);
  },
  onPvpTailEaten: (payload) => {
    const eaterNum = Number(payload?.eaterNum) || 0;
    const ownerNum = Number(payload?.ownerNum) || 0;
    const segIndex = Number(payload?.segIndex);
    const segValue = Number(payload?.segValue);
    if (!eaterNum || !ownerNum || eaterNum === ownerNum) return;
    if (!Number.isInteger(segIndex) || segIndex < 0) return;
    if (!Number.isFinite(segValue) || segValue <= 0) return;

    const eater = getPlayerByNum(eaterNum);
    const owner = getPlayerByNum(ownerNum);
    if (!eater || !owner) return;
    if (owner.eliminated || eater.eliminated) return;
    if (!Array.isArray(owner.tail) || owner.tail.length === 0) return;
    if (segIndex >= owner.tail.length) return;

    dropTailFromIndex(owner, segIndex + 1);
    removeTailAt(owner, segIndex);
    eater.enqueueTailValue(segValue);
    getStats(eater).score += Math.max(0, segValue);
  },
  onPvpHeadBump: (payload) => {
    const aNum = Number(payload?.aNum) || 0;
    const bNum = Number(payload?.bNum) || 0;
    if (!aNum || !bNum || aNum === bNum) return;
    const a = getPlayerByNum(aNum);
    const b = getPlayerByNum(bNum);
    if (!a || !b) return;
    const nx = Number(payload?.nx);
    const nz = Number(payload?.nz);
    const impulse = Number(payload?.impulse);
    const stunSec = Number(payload?.stunSec);
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
    if (!Number.isFinite(impulse) || impulse <= 0) return;
    if (!Number.isFinite(stunSec) || stunSec < 0) return;

    const len = Math.sqrt(nx * nx + nz * nz) || 1;
    const ux = nx / len;
    const uz = nz / len;
    if (!a.isRemote) {
      a.applyExplosion(-ux, -uz, { speed: impulse, stunSec });
    } else {
      const entry = netState.remotesByNum.get(aNum);
      if (entry?.kick) {
        entry.kick.vx = (Number(entry.kick.vx) || 0) + -ux * impulse;
        entry.kick.vz = (Number(entry.kick.vz) || 0) + -uz * impulse;
        entry.kick.lastAtMs = performance.now();
      }
    }
    if (!b.isRemote) {
      b.applyExplosion(ux, uz, { speed: impulse, stunSec });
    } else {
      const entry = netState.remotesByNum.get(bNum);
      if (entry?.kick) {
        entry.kick.vx = (Number(entry.kick.vx) || 0) + ux * impulse;
        entry.kick.vz = (Number(entry.kick.vz) || 0) + uz * impulse;
        entry.kick.lastAtMs = performance.now();
      }
    }
  },
});

lobbyUi.showStartOverlayDefault();

renderAliveCounter();
renderKillFeed();

// Helper بسيط عشان UI/Match systems يوقفوا الـ tick (Pause)
function setPaused(paused) {
  env.setPaused(paused);
}

// =========================
// وضع TEST: تخطي الـ UI وابدأ مباشرة
// =========================
if (!TEST_MODE) {
} else {
  lobbyUi.hideStartOverlay();
  if (startOverlay) startOverlay.style.display = "none";
  matchActive = true;
}

// =========================
// Start Rendering Loop
// =========================
env.start();
