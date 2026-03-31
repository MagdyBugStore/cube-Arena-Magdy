export function createInitialState(THREE) {
  return {
    scene: null,
    camera: null,
    renderer: null,

    ground: null,
    grid: null,

    player: null,
    playerNameTag: null,
    raycaster: null,
    pointerNdc: new THREE.Vector2(),
    pointerHasPosition: false,
    playerMoveDir: new THREE.Vector3(0, 0, 1),
    _tmpMoveDir: new THREE.Vector3(),
    cameraPosTarget: new THREE.Vector3(),

    lastTime: 0,
    initialized: false,

    _tmpLookAt: new THREE.Vector3(),

    cubes: [],
    freeCubeSpawner: null,
    playerValue: 2,
    _playerBox: new THREE.Box3(),

    score: 2,
    bestScore: 2,
    killCount: 0,
    gameTimeSec: 0,
    hudManager: null,
    gameOver: false,

    enemies: [],
    scatterCubes: [],

    playerPulseTime: 0,
    playerPendingRespawn: false,
    playerDeathFollowTimer: 0,
    playerDeathFollowTarget: null,

    tail: [],
    playerPathTracker: null,
    tailInsertQueue: [],
    tailInsertAnim: null,
    tailMergeAnim: null,
    headTailMergeAnim: null,
    tailMergeDelayTimer: 0,
    _tmpTailTargetPos: new THREE.Vector3(),

    _cubeGeometryCache: new Map(),
    _numberTextureCache: new Map(),
    _cubeMaterialCache: new Map(),
    _edgeMaterialCache: new Map(),
    _edgesGeometryCache: new Map(),
    _shadowTexture: null
  };
}
