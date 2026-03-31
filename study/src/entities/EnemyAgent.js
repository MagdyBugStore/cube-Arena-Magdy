import * as THREE from 'three';
import { PathTracker } from '../core/PathTracker.js';

export class EnemyAgent {
  constructor(mesh, cfg) {
    this.mesh = mesh;
    this.value = cfg.enemyStartValue;
    this.nameTag = null;
    this.dir = new THREE.Vector3(1, 0, 0);
    this.dirChangeTimer = cfg.enemyDirChangeEverySec * (0.4 + Math.random());
    this.speed = cfg.enemySpeed;
    this.tail = [];
    this.pathTracker = new PathTracker(cfg);
    this.headBox = new THREE.Box3();
    this.headPulseTime = 0;
    this.tailInsertQueue = [];
    this.tailInsertAnim = null;
    this.tailMergeAnim = null;
    this.headTailMergeAnim = null;
    this.tailMergeDelayTimer = 0;
    this.aiThinkTimer = 0;
    this.aiMode = 'idle';
    this.aiTarget = null;
  }
}
