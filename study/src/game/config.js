export const CFG = {
  // Cube
  cubeSize: 2,
  cubeScaleGrowthPerLevel: 1.14,
  playerColor: 0x4fa3ff,

  // Collectibles
  collectibleCubeCount: 25,
  freeCubeSpawnIntervalMinSec: 0.35,
  freeCubeSpawnIntervalMaxSec: 1.1,
  freeCubeSpawnHeightMin: 24,
  freeCubeSpawnHeightMax: 56,
  freeCubeFallSpeed: 26,
  freeCubeMaxCount: 120,

  // World
  groundSize: 1000,
  playAreaSize: 520,
  gridSize: 520,
  gridDivisions: 26,

  // Renderer / colors
  background: 0x6f6855,

  // Player movement
  playerSpeed: 14,
  // Global arcade speed multiplier (applies to the whole simulation).
  gameSpeedMultiplier: 3,
  playerMinSpeedFactor: 0.55,
  playerSpeedDecayPerLevel: 0.11,
  steerLerpPerSecond: 10,

  // Tail / Snake-like system
  tailSegmentLength: 1.35,
  tailSegmentSizeFactor: 0.2,
  tailLerpPerSecond: 14,
  tailChainSpring: 36,
  tailChainDamping: 10,
  tailChainMaxStretch: 0.8,
  tailInsertAnimSec: 0.16,
  tailMergeDelaySec: 0.08,
  tailMergeAnimSec: 0.5,
  pathPointMinDist: 0.2,
  pathHistoryBufferDistance: 16,

  // Camera follow
  cameraDistance: 30,
  cameraHeight: 24,
  cameraLerpPerSecond: 6,
  cameraBaseFov: 52,
  cameraMaxFov: 68,
  cameraZoomBySizeFactor: 11,
  cameraOffsetScaleBySize: 0.24,
  cameraWorldOffsetX: 28,
  cameraWorldOffsetY: 36,
  cameraWorldOffsetZ: 28,
  cameraLookAheadZ: 0,

  // Cursor raycasting
  raycastMaxDistance: 5000,

  // Collectible cube values
  collectibleValueMin: 2,
  collectibleValueMax: 16,
  playerName: 'اللاعب',

  // Enemies (AI)
  enemyCount: 24,
  enemyStartValue: 2,
  enemySpeed: 7,
  enemyMinSpeedFactor: 0.6,
  enemySpeedDecayPerLevel: 0.1,
  enemyEscapeSpeedMultiplier: 1.22,
  enemyDirChangeEverySec: 1.1,
  enemySteerLerpPerSecond: 9,
  enemyThreatDetectRadius: 90,
  enemyThreatPanicRadius: 38,
  enemyPreyDetectRadius: 140,
  enemyAiThinkIntervalMinSec: 0.04,
  enemyAiThinkIntervalMaxSec: 0.1,
  // When enemy has no clear target (idle), force quicker re-evaluation to reduce random wandering.
  enemyAiIdleThinkIntervalMinSec: 0.02,
  enemyAiIdleThinkIntervalMaxSec: 0.06,
  enemyPreyValueAdvantageMin: 1,
  enemyTailFollowLerpPerSecond: 16,
  enemyTailMaxSegments: 45,
  enemyTailScatterSpeed: 18,
  enemyTailScatterLifeSec: 1.7,
  enemyTailScatterDamping: 6,

  // Hit response
  enemyHitEndsGame: false,

  // Score / HUD
  bestScoreStorageKey: 'cube_arena_bestScore',

  // Merge feedback
  playerPulseDurationSec: 0.22,
  playerPulseMaxScale: 1.28,
  enemyHeadPulseDurationSec: 0.18,
  enemyHeadPulseMaxScale: 1.18,
  // After player death, follow the killer briefly before respawn.
  playerDeathFollowSeconds: 3
};
