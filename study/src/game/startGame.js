import * as THREE from 'three';
import { HudManager } from '../core/HudManager.js';
import { PathTracker } from '../core/PathTracker.js';
import { EnemyAgent } from '../entities/EnemyAgent.js';
import { CubeEntity } from '../entities/CubeEntity.js';
import { FreeCubeSpawner } from '../systems/FreeCubeSpawner.js';
import { CFG } from './config.js';
import { createInitialState } from './createInitialState.js';
import { clamp, smoothingT } from './math.js';

export function startGame() {
  const state = createInitialState(THREE);

  function styleForValue(value) {
    if (value <= 1) {
      const bg = '#F4F6FF';
      const cubeColor = parseInt(bg.slice(1), 16);
      return { bg, cubeColor };
    }
    // Deterministic palette (supports values beyond 8 like 16, 32, ...)
    const exp = Math.round(Math.log2(Math.max(1, value))); // 2->1, 4->2, 8->3, ...
    // Cohesive, modern palette (soft yet vibrant)
    const palette = [
      '#FF6B6B', // coral red
      '#FFD166', // warm yellow
      '#06D6A0', // mint green
      '#4ECDC4', // teal
      '#6C63FF', // indigo
      '#F78C6B'  // peach
    ];
    const bg = palette[Math.max(0, exp - 1) % palette.length];
    const cubeColor = parseInt(bg.slice(1), 16);
    return { bg, cubeColor };
  }

  function cubeSizeForValue(value) {
    const base = CFG.cubeSize;
    const v = Math.max(2, value || 2);
    const level = Math.max(0, Math.round(Math.log2(v)) - 1);
    const growth = CFG.cubeScaleGrowthPerLevel || 1.14;
    return base * Math.pow(growth, level);
  }

  function makeNameTagSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4.2, 1.1, 1);
    return sprite;
  }

  function updatePlayerNameTagPosition() {
    if (!state.player || !state.playerNameTag) return;
    const size = cubeSizeForValue(state.playerValue);
    state.playerNameTag.position.set(0, size * 0.75 + 1, 0);
  }

  function updateEnemyNameTagPosition(enemy) {
    if (!enemy || !enemy.nameTag) return;
    const size = cubeSizeForValue(enemy.value);
    enemy.nameTag.position.set(0, size * 0.75 + 1, 0);
  }

  function createNumberTexture(text, backgroundColor) {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');

    // Top-face base color
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, size, size);

    // Diagonal highlight/shadow similar to polished arcade cubes.
    const shade = ctx.createLinearGradient(0, 0, size, size);
    shade.addColorStop(0, 'rgba(255,255,255,0.22)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    shade.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, size, size);

    // Value text on the top face
    // Big white number that nearly covers the entire top face.
    const textValue = String(text);
    let fontSize = 220;
    ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    while ((ctx.measureText(textValue).width > size * 0.94 || fontSize > size * 0.82) && fontSize > 72) {
      fontSize -= 6;
      ctx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    }

    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillText(textValue, 0, 0);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    return tex;
  }

  function getNumberTexture(value) {
    const key = String(value);
    const cached = state._numberTextureCache.get(key);
    if (cached) return cached;

    const { bg } = styleForValue(value);
    const tex = createNumberTexture(String(value), bg);
    state._numberTextureCache.set(key, tex);
    return tex;
  }

  function getCubeGeometry(size) {
    const key = String(size);
    const cached = state._cubeGeometryCache.get(key);
    if (cached) return cached;

    const geometry = new THREE.BoxGeometry(size, size, size);
    state._cubeGeometryCache.set(key, geometry);
    return geometry;
  }

  function getCubeMaterialForValue(value) {
    const key = String(value);
    const cachedBase = state._cubeMaterialCache.get(key);
    if (cachedBase) return cachedBase.map((mat) => mat.clone());

    const { cubeColor } = styleForValue(value);
    const numberTex = getNumberTexture(value);
    const tint = (hex, factor) => {
      const c = new THREE.Color(hex);
      c.r = clamp(c.r * factor, 0, 1);
      c.g = clamp(c.g * factor, 0, 1);
      c.b = clamp(c.b * factor, 0, 1);
      return c.getHex();
    };

    const topColor = tint(cubeColor, 1.15);
    const sideColor = tint(cubeColor, 0.55);
    const bottomColor = tint(cubeColor, 0.35);

    const makeMat = (color, map = null) =>
      new THREE.MeshStandardMaterial({
        color,
        map,
        roughness: 0.4,
        metalness: 0.1
      });

    // BoxGeometry face material order: right, left, top, bottom, front, back
    const baseMaterials = [
      makeMat(sideColor, null),
      makeMat(sideColor, null),
      makeMat(topColor, numberTex),
      makeMat(bottomColor, null),
      makeMat(sideColor, null),
      makeMat(sideColor, null)
    ];

    // Cache templates; return clones for each mesh instance.
    state._cubeMaterialCache.set(key, baseMaterials);
    return baseMaterials.map((mat) => mat.clone());
  }

  function createNumberedCube(value, size) {
    // Use base geometry once, then scale by value size.
    // Previously geometry size + scale both applied, which over-scaled cubes.
    const geometry = getCubeGeometry(CFG.cubeSize);
    const materials = getCubeMaterialForValue(value);
    const cube = new THREE.Mesh(geometry, materials);

    cube.userData.value = value;
    cube.userData.baseScale = size / CFG.cubeSize;
    cube.scale.setScalar(cube.userData.baseScale);
    return cube;
  }

  function attachCubeEntity(cube, type, value, size, options = {}) {
    const entity = new CubeEntity(cube, type, value, size, options);
    cube.userData.type = type;
    return entity;
  }

  function updatePlayerNumberTexture(value) {
    updateCubeNumberTexture(state.player, value);
  }

  function updateCubeNumberTexture(cube, value) {
    const tex = getNumberTexture(value);
    const { cubeColor } = styleForValue(value);
    const tint = (hex, factor) => {
      const c = new THREE.Color(hex);
      c.r = clamp(c.r * factor, 0, 1);
      c.g = clamp(c.g * factor, 0, 1);
      c.b = clamp(c.b * factor, 0, 1);
      return c.getHex();
    };

    const topColor = tint(cubeColor, 1.08);
    const sideColor = tint(cubeColor, 0.64);
    const bottomColor = tint(cubeColor, 0.44);

    const cubeMats = Array.isArray(cube.material) ? cube.material : [cube.material];
    if (cubeMats.length >= 6) {
      // right, left, top, bottom, front, back
      const sideIdx = [0, 1, 4, 5];
      for (const idx of sideIdx) {
        cubeMats[idx].map = null;
        cubeMats[idx].color.setHex(sideColor);
        cubeMats[idx].needsUpdate = true;
      }

      cubeMats[2].map = tex;
      cubeMats[2].color.setHex(topColor);
      cubeMats[2].needsUpdate = true;

      cubeMats[3].map = null;
      cubeMats[3].color.setHex(bottomColor);
      cubeMats[3].needsUpdate = true;
      return;
    }

    // Fallback for non-box/non-multi-material cases.
    for (const mat of cubeMats) {
      mat.map = tex;
      mat.color.setHex(topColor);
      mat.needsUpdate = true;
    }
  }

  function initHud() {
    state.hudManager = new HudManager();
    state.hudManager.init();
    updateHud();
  }

  function getMiniMapData() {
    const playAreaHalf = (CFG.playAreaSize || CFG.groundSize) / 2;
    const items = [];
    for (const cube of state.cubes) {
      if (!cube || !cube.position) continue;
      items.push({ x: cube.position.x, z: cube.position.z, color: '#ffffff', size: 3 });
    }
    for (const enemy of state.enemies) {
      if (!enemy || !enemy.mesh) continue;
      items.push({ x: enemy.mesh.position.x, z: enemy.mesh.position.z, color: '#d8d8d8', size: 3 });
    }
    if (state.player && state.player.position) {
      items.push({ x: state.player.position.x, z: state.player.position.z, color: '#ff2a2a', size: 4 });
    }
    return { playAreaHalf, items };
  }

  function getTopPlayersData() {
    const rows = [];
    rows.push({ name: CFG.playerName, value: state.playerValue, isPlayer: true });
    for (const enemy of state.enemies) {
      if (!enemy) continue;
      rows.push({
        name: enemy.label || 'PC',
        value: enemy.value || CFG.enemyStartValue,
        isPlayer: false
      });
    }

    rows.sort((a, b) => b.value - a.value);
    return rows.slice(0, 10).map((row, idx) => ({
      rank: idx + 1,
      name: row.name,
      value: row.value,
      isPlayer: row.isPlayer
    }));
  }

  function updateHud() {
    if (!state.hudManager) return;
    state.hudManager.render(
      getTopPlayersData(),
      getMiniMapData()
    );
  }

  function applyPlayerPulse(dt) {
    if (!state.player) return;

    if (state.playerPulseTime > 0) {
      state.playerPulseTime = Math.max(0, state.playerPulseTime - dt);
      const k = state.playerPulseTime / CFG.playerPulseDurationSec; // 1 -> 0
      const baseScale = state.player.userData.baseScale || 1;
      const s = baseScale * (1 + (CFG.playerPulseMaxScale - 1) * (k * k));
      state.player.scale.setScalar(s);
    } else {
      state.player.scale.setScalar(state.player.userData.baseScale || 1);
    }
  }

  function showEatEvent(eaterName, eatenName) {
    if (!state.hudManager) return;
    state.hudManager.pushEatEvent(`${eaterName} اكل ${eatenName}`);
  }

  function normalizeTailByRules(tailList) {
    // Rules:
    // 1) Head -> tail is sorted from largest to smallest.
    // 2) If two adjacent values are equal, they merge into one doubled cube.
    let values = tailList
      .map((cube) => (cube && cube.userData ? cube.userData.value : null))
      .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);

    if (values.length === 0) return;

    values.sort((a, b) => b - a);

    let changed = true;
    while (changed) {
      changed = false;
      const merged = [];
      for (let i = 0; i < values.length; i++) {
        if (i < values.length - 1 && values[i] === values[i + 1]) {
          merged.push(values[i] * 2);
          i++;
          changed = true;
        } else {
          merged.push(values[i]);
        }
      }
      merged.sort((a, b) => b - a);
      values = merged;
    }

    for (let i = 0; i < values.length; i++) {
      const cube = tailList[i];
      if (!cube) continue;
      const v = values[i];
      updateCubeNumberTexture(cube, v);
      cube.userData.value = v;
      if (cube.userData && cube.userData.entity) cube.userData.entity.setValue(v);
      const s = cubeSizeForValue(v) / CFG.cubeSize;
      cube.userData.baseScale = s;
      cube.scale.setScalar(s);
    }

    for (let i = tailList.length - 1; i >= values.length; i--) {
      const cube = tailList[i];
      if (cube) state.scene.remove(cube);
      tailList.pop();
    }
  }

  function sortTailDescendingByValue(tailList) {
    if (!Array.isArray(tailList) || tailList.length < 2) return;
    tailList.sort((a, b) => {
      const av = a && a.userData ? a.userData.value || 0 : 0;
      const bv = b && b.userData ? b.userData.value || 0 : 0;
      return bv - av;
    });
  }

  function getTailInsertIndex(value) {
    for (let i = 0; i < state.tail.length; i++) {
      const tailValue = state.tail[i] && state.tail[i].userData ? state.tail[i].userData.value : 0;
      if (tailValue < value) return i;
    }
    return state.tail.length;
  }

  function startTailInsertAnimation(value) {
    if (!state.player || !state.playerPathTracker) return;
    const size = cubeSizeForValue(value);
    const cube = createNumberedCube(value, size);
    attachCubeEntity(cube, CubeEntity.TYPES.TAIL, value, size);
    cube.position.set(state.player.position.x, size / 2, state.player.position.z);
    state.scene.add(cube);
    state.tailInsertAnim = {
      cube,
      value,
      elapsed: 0,
      duration: CFG.tailInsertAnimSec,
      targetIndex: getTailInsertIndex(value)
    };
  }

  function enqueueTailValue(value) {
    state.tailInsertQueue.push(value);
  }

  function applyHeadTailMerge() {
    if (!state.player || state.tail.length === 0) return false;
    const firstTail = state.tail[0];
    if (!firstTail || !firstTail.userData) return false;
    if (firstTail.userData.value !== state.playerValue) return false;

    state.headTailMergeAnim = {
      fromCube: firstTail,
      elapsed: 0,
      duration: CFG.tailMergeAnimSec
    };
    state.tailMergeDelayTimer = CFG.tailMergeDelaySec;
    return true;
  }

  function finalizeHeadTailMerge() {
    if (!state.player || !state.headTailMergeAnim) return;
    const firstTail = state.tail[0];
    const fromCube = state.headTailMergeAnim.fromCube;
    if (!firstTail || firstTail !== fromCube || !firstTail.userData) return;
    if (firstTail.userData.value !== state.playerValue) return;

    const nextValue = state.playerValue * 2;
    state.playerValue = nextValue;
    if (state.player.userData && state.player.userData.entity) {
      state.player.userData.entity.setValue(nextValue);
    }
    updatePlayerNumberTexture(nextValue);
    const s = cubeSizeForValue(nextValue) / CFG.cubeSize;
    state.player.userData.baseScale = s;
    state.player.scale.setScalar(s);
    updatePlayerNameTagPosition();
    updateHud();
    state.playerPulseTime = CFG.playerPulseDurationSec;

    state.scene.remove(firstTail);
    state.tail.splice(0, 1);
    state.tailMergeDelayTimer = CFG.tailMergeDelaySec;
  }

  function findNextTailMergePair() {
    for (let i = 0; i < state.tail.length - 1; i++) {
      const a = state.tail[i];
      const b = state.tail[i + 1];
      if (!a || !b || !a.userData || !b.userData) continue;
      if (a.userData.value === b.userData.value) return i;
    }
    return -1;
  }

  function startTailMergeAnimation(index) {
    const fromCube = state.tail[index + 1];
    const intoCube = state.tail[index];
    if (!fromCube || !intoCube) return false;
    state.tailMergeAnim = {
      index,
      fromCube,
      intoCube,
      elapsed: 0,
      duration: CFG.tailMergeAnimSec
    };
    return true;
  }

  function finalizeTailMerge(index) {
    const intoCube = state.tail[index];
    const fromCube = state.tail[index + 1];
    if (!intoCube || !fromCube || !intoCube.userData || !fromCube.userData) return;

    const mergedValue = (intoCube.userData.value || 0) * 2;
    updateCubeNumberTexture(intoCube, mergedValue);
    intoCube.userData.value = mergedValue;
    if (intoCube.userData.entity) intoCube.userData.entity.setValue(mergedValue);
    const s = cubeSizeForValue(mergedValue) / CFG.cubeSize;
    intoCube.userData.baseScale = s;
    intoCube.scale.setScalar(s);

    state.scene.remove(fromCube);
    state.tail.splice(index + 1, 1);
    state.tailMergeDelayTimer = CFG.tailMergeDelaySec;
  }

  // Distance along head path for a specific tail index.
  // Uses adjacent cube sizes to prevent overlaps when sizes differ a lot.
  function getPlayerTailBehindDist(targetIndex, overrideValue = null) {
    const headSize = cubeSizeForValue(state.playerValue);
    let prevSize = headSize;
    let cumDist = 0;

    for (let j = 0; j <= targetIndex; j++) {
      const val =
        j === targetIndex && overrideValue != null
          ? overrideValue
          : state.tail[j]?.userData?.value ?? 2;
      const currSize = cubeSizeForValue(val);

      // Minimum no-overlap distance + tiny visual padding.
      const minNoOverlap = prevSize * 0.5 + currSize * 0.5;
      const tinyPadding = Math.max(0.04, CFG.cubeSize * 0.06);
      const gap = minNoOverlap + tinyPadding;
      cumDist += gap;
      prevSize = currSize;
    }

    return cumDist;
  }

  function getEnemyTailBehindDist(enemy, targetIndex, overrideValue = null) {
    if (!enemy) return 0;
    const headSize = cubeSizeForValue(enemy.value || CFG.enemyStartValue);
    let prevSize = headSize;
    let cumDist = 0;

    for (let j = 0; j <= targetIndex; j++) {
      const val =
        j === targetIndex && overrideValue != null
          ? overrideValue
          : enemy.tail[j]?.userData?.value ?? 2;
      const currSize = cubeSizeForValue(val);
      const minNoOverlap = prevSize * 0.5 + currSize * 0.5;
      const tinyPadding = Math.max(0.04, CFG.cubeSize * 0.06);
      const gap = minNoOverlap + tinyPadding;
      cumDist += gap;
      prevSize = currSize;
    }

    return cumDist;
  }

  function updateTailFeedingFlow(dt) {
    if (!state.player || !state.playerPathTracker) return;

    if (!state.tailInsertAnim && state.tailInsertQueue.length > 0) {
      const v = state.tailInsertQueue.shift();
      startTailInsertAnimation(v);
    }

    if (state.tailInsertAnim) {
      const anim = state.tailInsertAnim;
      anim.elapsed += dt;
      const t = clamp(anim.elapsed / Math.max(1e-5, anim.duration), 0, 1);

      const ownSize = cubeSizeForValue(anim.value);
      const behindDist = getPlayerTailBehindDist(anim.targetIndex, anim.value);
      const targetCumDist = state.playerPathTracker.totalDist - behindDist;
      getPointOnHeadPath(targetCumDist, state._tmpTailTargetPos);
      anim.cube.position.x = THREE.MathUtils.lerp(anim.cube.position.x, state._tmpTailTargetPos.x, 0.55);
      anim.cube.position.z = THREE.MathUtils.lerp(anim.cube.position.z, state._tmpTailTargetPos.z, 0.55);
      anim.cube.position.y = ownSize / 2;

      if (t >= 1) {
        state.tail.splice(anim.targetIndex, 0, anim.cube);
        state.tailInsertAnim = null;
        state.tailMergeDelayTimer = CFG.tailMergeDelaySec;
        // Keep ordering stable, then run merge checks gradually with effect.
        sortTailDescendingByValue(state.tail);
      }
    }

    if (state.tailMergeAnim) {
      const anim = state.tailMergeAnim;
      anim.elapsed += dt;
      const t = clamp(anim.elapsed / Math.max(1e-5, anim.duration), 0, 1);
      if (anim.fromCube && anim.intoCube) {
        anim.fromCube.position.x = THREE.MathUtils.lerp(anim.fromCube.position.x, anim.intoCube.position.x, 0.7);
        anim.fromCube.position.z = THREE.MathUtils.lerp(anim.fromCube.position.z, anim.intoCube.position.z, 0.7);
      }
      if (t >= 1) {
        finalizeTailMerge(anim.index);
        state.tailMergeAnim = null;
        sortTailDescendingByValue(state.tail);
      }
      return;
    }

    if (state.headTailMergeAnim) {
      const anim = state.headTailMergeAnim;
      anim.elapsed += dt;
      const t = clamp(anim.elapsed / Math.max(1e-5, anim.duration), 0, 1);
      if (anim.fromCube && state.player) {
        anim.fromCube.position.x = THREE.MathUtils.lerp(anim.fromCube.position.x, state.player.position.x, 0.7);
        anim.fromCube.position.z = THREE.MathUtils.lerp(anim.fromCube.position.z, state.player.position.z, 0.7);
      }
      if (t >= 1) {
        finalizeHeadTailMerge();
        state.headTailMergeAnim = null;
        sortTailDescendingByValue(state.tail);
      }
      return;
    }

    if (state.tailMergeDelayTimer > 0) {
      state.tailMergeDelayTimer = Math.max(0, state.tailMergeDelayTimer - dt);
      return;
    }

    // Head can merge with the closest tail segment using the same "equal values merge" rule.
    if (applyHeadTailMerge()) {
      sortTailDescendingByValue(state.tail);
      return;
    }

    const nextPair = findNextTailMergePair();
    if (nextPair >= 0) startTailMergeAnimation(nextPair);
  }

  function handleCollectibleCubesAndTail() {
    if (!state.player || state.cubes.length === 0) return;

    // Only update player box each frame; cube boxes were cached at spawn.
    const playerBox = state._playerBox;
    playerBox.setFromObject(state.player);

    const tailValuesToAdd = [];

    const remaining = [];
    for (const cube of state.cubes) {
      if (!cube || !cube.userData || !cube.userData.box) {
        remaining.push(cube);
        continue;
      }

      if (!playerBox.intersectsBox(cube.userData.box)) {
        remaining.push(cube);
        continue;
      }

      const v = cube.userData.value;
      if (v > state.playerValue) {
        remaining.push(cube);
        continue;
      }

      // Collected
      state.scene.remove(cube);
      tailValuesToAdd.push(v);
    }

    state.cubes = remaining;

    // Insert into tail in value order with animation.
    for (const v of tailValuesToAdd) enqueueTailValue(v);
  }

  function recordHeadPathPoint() {
    if (!state.playerPathTracker || !state.player) return;
    state.playerPathTracker.record(state.player.position, state.tail.length + 1);
  }

  function getPointOnHeadPath(cumDist, outVec3) {
    if (!state.playerPathTracker || !state.player) return outVec3;
    return state.playerPathTracker.getPoint(cumDist, state.player.position, outVec3);
  }

  function updateTailPositions(dt) {
    if (!state.player || state.tail.length === 0) return;
    if (!state.playerPathTracker || state.playerPathTracker.points.length === 0) return;

    const speedMul = CFG.gameSpeedMultiplier || 1;
    const t = smoothingT(CFG.tailLerpPerSecond * speedMul, dt);
    const rotT = smoothingT((CFG.tailLerpPerSecond || 14) * 0.9 * speedMul, dt);

    for (let i = 0; i < state.tail.length; i++) {
      const cube = state.tail[i];
      if (!cube) continue;

      const ownSize = cubeSizeForValue(cube.userData.value || 2);
      const behindDist = getPlayerTailBehindDist(i); // follow-the-leader spacing (size-aware)
      const targetCumDist = state.playerPathTracker.totalDist - behindDist;
      getPointOnHeadPath(targetCumDist, state._tmpTailTargetPos);

      const nextX = THREE.MathUtils.lerp(cube.position.x, state._tmpTailTargetPos.x, t);
      const nextZ = THREE.MathUtils.lerp(cube.position.z, state._tmpTailTargetPos.z, t);
      const dx = nextX - cube.position.x;
      const dz = nextZ - cube.position.z;
      cube.position.x = nextX;
      cube.position.z = nextZ;
      cube.position.y = ownSize / 2;

      if (dx * dx + dz * dz > 1e-7) {
        const targetYaw = Math.atan2(dx, dz);
        cube.rotation.y = THREE.MathUtils.lerp(cube.rotation.y || targetYaw, targetYaw, rotT);
      }
    }
  }

  function getGroundBounds() {
    const half = (CFG.playAreaSize || CFG.groundSize) / 2;
    const margin = CFG.cubeSize; // keep cubes comfortably inside the ground bounds
    return {
      minX: -half + margin,
      maxX: half - margin,
      minZ: -half + margin,
      maxZ: half - margin
    };
  }

  function enemyPickRandomDir(enemy) {
    const angle = Math.random() * Math.PI * 2;
    enemy.dir.set(Math.cos(angle), 0, Math.sin(angle));
  }

  function getSpeedScaleForValue(value, minFactor, decayPerLevel) {
    const clampedValue = Math.max(2, value || 2);
    const level = Math.max(0, Math.round(Math.log2(clampedValue)) - 1);
    const factor = 1 - level * (decayPerLevel || 0);
    return Math.max(minFactor, factor);
  }

  function getPlayerMoveSpeed() {
    const minFactor = CFG.playerMinSpeedFactor ?? 0.55;
    const decay = CFG.playerSpeedDecayPerLevel ?? 0.1;
    const speedMul = CFG.gameSpeedMultiplier || 1;
    return CFG.playerSpeed * speedMul * getSpeedScaleForValue(state.playerValue, minFactor, decay);
  }

  function getEnemyMoveSpeed(enemy) {
    const minFactor = CFG.enemyMinSpeedFactor ?? 0.6;
    const decay = CFG.enemySpeedDecayPerLevel ?? 0.1;
    const speedMul = CFG.gameSpeedMultiplier || 1;
    return enemy.speed * speedMul * getSpeedScaleForValue(enemy.value, minFactor, decay);
  }

  function findClosestThreatForEnemy(enemy) {
    if (!enemy || !enemy.mesh) return null;

    const ex = enemy.mesh.position.x;
    const ez = enemy.mesh.position.z;
    // Escape only when the threat is too close, otherwise keep attacking/collecting.
    const threatRadius =
      CFG.enemyThreatPanicRadius || (CFG.enemyThreatDetectRadius || CFG.groundSize * 0.2) * 0.45;
    const threatRadiusSq = threatRadius * threatRadius;

    let best = null;
    let bestDistSq = Infinity;

    if (state.player && state.playerValue > enemy.value) {
      const dx = state.player.position.x - ex;
      const dz = state.player.position.z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq && d2 <= threatRadiusSq) {
        best = { x: state.player.position.x, z: state.player.position.z };
        bestDistSq = d2;
      }
    }

    for (const other of state.enemies) {
      if (!other || other === enemy || !other.mesh) continue;
      if (other.value <= enemy.value) continue;
      const dx = other.mesh.position.x - ex;
      const dz = other.mesh.position.z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq && d2 <= threatRadiusSq) {
        best = { x: other.mesh.position.x, z: other.mesh.position.z };
        bestDistSq = d2;
      }
    }

    return best;
  }

  function findBestPreyCubeForEnemy(enemy) {
    if (!enemy || !enemy.mesh || !state.cubes || state.cubes.length === 0) return null;

    const ex = enemy.mesh.position.x;
    const ez = enemy.mesh.position.z;
    const preyRadius = CFG.enemyPreyDetectRadius || CFG.groundSize * 0.3;
    const preyRadiusSq = preyRadius * preyRadius;

    let bestCube = null;
    let bestValue = -Infinity;
    let bestDistSq = Infinity;

    // Free cubes only: nearest edible (<= enemy value) inside vision radius.
    const consider = (cube) => {
      if (!cube || !cube.position || !cube.userData) return;
      const value = cube.userData.value;
      if (!Number.isFinite(value) || value > enemy.value) return; // smaller or equal
      const dx = cube.position.x - ex;
      const dz = cube.position.z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 > preyRadiusSq) return;

      // Nearest first; if equal distance, prefer bigger value.
      if (d2 < bestDistSq || (d2 === bestDistSq && value > bestValue)) {
        bestDistSq = d2;
        bestValue = value;
        bestCube = cube;
      }
    };

    for (const c of state.cubes) consider(c);

    return bestCube;
  }

  function findBestPreyAgentForEnemy(enemy) {
    if (!enemy || !enemy.mesh) return null;
    const ex = enemy.mesh.position.x;
    const ez = enemy.mesh.position.z;
    const preyRadius = CFG.enemyPreyDetectRadius || CFG.groundSize * 0.3;
    const preyRadiusSq = preyRadius * preyRadius;
    const minAdvantage = CFG.enemyPreyValueAdvantageMin || 1;

    let best = null;
    let bestValue = -Infinity;
    let bestDistSq = Infinity;

    const consider = (name, value, x, z) => {
      if (!Number.isFinite(value)) return;
      if (enemy.value - value < minAdvantage) return;
      const dx = x - ex;
      const dz = z - ez;
      const d2 = dx * dx + dz * dz;
      if (d2 > preyRadiusSq) return;
      if (d2 < bestDistSq || (d2 === bestDistSq && value > bestValue)) {
        best = { name, x, z, value, distSq: d2 };
        bestValue = value;
        bestDistSq = d2;
      }
    };

    if (state.player) {
      consider(CFG.playerName, state.playerValue, state.player.position.x, state.player.position.z);
    }

    for (const other of state.enemies) {
      if (!other || other === enemy || !other.mesh) continue;
      consider(other.label || 'PC', other.value, other.mesh.position.x, other.mesh.position.z);
    }

    return best;
  }

  function pickEnemyDecision(enemy) {
    // Priority order:
    // 1) Look for edible target in vision (smaller player OR free cube <= value), nearest wins.
    // 2) Otherwise escape threats.
    const preyAgent = findBestPreyAgentForEnemy(enemy);
    const preyCube = findBestPreyCubeForEnemy(enemy);
    if (preyAgent && preyCube) {
      const dx = preyCube.position.x - enemy.mesh.position.x;
      const dz = preyCube.position.z - enemy.mesh.position.z;
      const cubeDistSq = dx * dx + dz * dz;
      if (preyAgent.distSq <= cubeDistSq) return { mode: 'hunt_agent', target: preyAgent };
      return { mode: 'hunt_cube', target: preyCube };
    }
    if (preyAgent) return { mode: 'hunt_agent', target: preyAgent };
    if (preyCube) return { mode: 'hunt_cube', target: preyCube };

    const threat = findClosestThreatForEnemy(enemy);
    if (threat) return { mode: 'escape', target: threat };

    return { mode: 'idle', target: null };
  }

  function applyEnemyHeadPulse(enemy, dt) {
    const baseScale = enemy.mesh.userData.baseScale || 1;
    if (enemy.headPulseTime > 0) {
      enemy.headPulseTime = Math.max(0, enemy.headPulseTime - dt);
      const k = enemy.headPulseTime / CFG.enemyHeadPulseDurationSec; // 1 -> 0
      const s = baseScale * (1 + (CFG.enemyHeadPulseMaxScale - 1) * (k * k));
      enemy.mesh.scale.setScalar(s);
    } else {
      enemy.mesh.scale.setScalar(baseScale);
    }
  }

  function getPointOnEnemyHeadPath(enemy, cumDist, outVec3) {
    if (!enemy || !enemy.pathTracker || !enemy.mesh) return outVec3;
    return enemy.pathTracker.getPoint(cumDist, enemy.mesh.position, outVec3);
  }

  function enemyRecordHeadPathPoint(enemy) {
    if (!enemy || !enemy.pathTracker || !enemy.mesh) return;
    enemy.pathTracker.record(enemy.mesh.position, enemy.tail.length + 1);
  }

  function addEnemyTailCube(enemy, value, index = enemy.tail.length) {
    const size = cubeSizeForValue(value);
    const cube = createNumberedCube(value, size);
    attachCubeEntity(cube, CubeEntity.TYPES.TAIL, value, size);
    cube.position.set(enemy.mesh.position.x, size / 2, enemy.mesh.position.z);
    cube.userData.box = new THREE.Box3().setFromObject(cube);
    state.scene.add(cube);
    enemy.tail.splice(index, 0, cube);
    return cube;
  }

  function trimEnemyTailToMax(enemy) {
    // Hard cap to keep collisions and tail follow cheap.
    if (enemy.tail.length > CFG.enemyTailMaxSegments) {
      const removed = enemy.tail.pop();
      if (removed) state.scene.remove(removed);
    }
  }

  function getEnemyTailInsertIndex(enemy, value) {
    for (let i = 0; i < enemy.tail.length; i++) {
      const tailValue =
        enemy.tail[i] && enemy.tail[i].userData ? enemy.tail[i].userData.value : 0;
      if (tailValue < value) return i;
    }
    return enemy.tail.length;
  }

  function enqueueEnemyTailValue(enemy, value) {
    if (!enemy || !Number.isFinite(value) || value <= 0) return;
    enemy.tailInsertQueue.push(value);
  }

  function startEnemyTailInsertAnimation(enemy, value) {
    if (!enemy || !enemy.mesh || !enemy.pathTracker) return;
    const size = cubeSizeForValue(value);
    const cube = createNumberedCube(value, size);
    attachCubeEntity(cube, CubeEntity.TYPES.TAIL, value, size);
    cube.position.set(enemy.mesh.position.x, size / 2, enemy.mesh.position.z);
    state.scene.add(cube);
    enemy.tailInsertAnim = {
      cube,
      value,
      elapsed: 0,
      duration: CFG.tailInsertAnimSec,
      targetIndex: getEnemyTailInsertIndex(enemy, value)
    };
  }

  function applyEnemyHeadTailMerge(enemy) {
    if (!enemy || !enemy.mesh || enemy.tail.length === 0) return false;
    const firstTail = enemy.tail[0];
    if (!firstTail || !firstTail.userData) return false;
    if (firstTail.userData.value !== enemy.value) return false;

    enemy.headTailMergeAnim = {
      fromCube: firstTail,
      elapsed: 0,
      duration: CFG.tailMergeAnimSec
    };
    enemy.tailMergeDelayTimer = CFG.tailMergeDelaySec;
    return true;
  }

  function finalizeEnemyHeadTailMerge(enemy) {
    if (!enemy || !enemy.mesh || !enemy.headTailMergeAnim) return;
    const firstTail = enemy.tail[0];
    const fromCube = enemy.headTailMergeAnim.fromCube;
    if (!firstTail || firstTail !== fromCube || !firstTail.userData) return;
    if (firstTail.userData.value !== enemy.value) return;

    const nextValue = enemy.value * 2;
    enemy.value = nextValue;
    if (enemy.mesh.userData && enemy.mesh.userData.entity) {
      enemy.mesh.userData.entity.setValue(nextValue);
    }
    updateCubeNumberTexture(enemy.mesh, nextValue);
    const s = cubeSizeForValue(nextValue) / CFG.cubeSize;
    enemy.mesh.userData.baseScale = s;
    enemy.mesh.scale.setScalar(s);
    updateEnemyNameTagPosition(enemy);
    enemy.headPulseTime = CFG.enemyHeadPulseDurationSec;

    state.scene.remove(firstTail);
    enemy.tail.splice(0, 1);
    enemy.tailMergeDelayTimer = CFG.tailMergeDelaySec;
  }

  function findEnemyNextTailMergePair(enemy) {
    if (!enemy || enemy.tail.length < 2) return -1;
    for (let i = 0; i < enemy.tail.length - 1; i++) {
      const a = enemy.tail[i];
      const b = enemy.tail[i + 1];
      if (!a || !b || !a.userData || !b.userData) continue;
      if (a.userData.value === b.userData.value) return i;
    }
    return -1;
  }

  function startEnemyTailMergeAnimation(enemy, index) {
    const fromCube = enemy.tail[index + 1];
    const intoCube = enemy.tail[index];
    if (!fromCube || !intoCube) return false;
    enemy.tailMergeAnim = {
      index,
      fromCube,
      intoCube,
      elapsed: 0,
      duration: CFG.tailMergeAnimSec
    };
    return true;
  }

  function finalizeEnemyTailMerge(enemy, index) {
    const intoCube = enemy.tail[index];
    const fromCube = enemy.tail[index + 1];
    if (!intoCube || !fromCube || !intoCube.userData || !fromCube.userData) return;

    const mergedValue = (intoCube.userData.value || 0) * 2;
    updateCubeNumberTexture(intoCube, mergedValue);
    intoCube.userData.value = mergedValue;
    if (intoCube.userData.entity) intoCube.userData.entity.setValue(mergedValue);
    const s = cubeSizeForValue(mergedValue) / CFG.cubeSize;
    intoCube.userData.baseScale = s;
    intoCube.scale.setScalar(s);

    state.scene.remove(fromCube);
    enemy.tail.splice(index + 1, 1);
    enemy.tailMergeDelayTimer = CFG.tailMergeDelaySec;
    trimEnemyTailToMax(enemy);
  }

  function updateEnemyTailFeedingFlow(enemy, dt) {
    if (!enemy || !enemy.mesh || !enemy.pathTracker) return;

    if (!enemy.tailInsertAnim && enemy.tailInsertQueue.length > 0) {
      const v = enemy.tailInsertQueue.shift();
      startEnemyTailInsertAnimation(enemy, v);
    }

    if (enemy.tailInsertAnim) {
      const anim = enemy.tailInsertAnim;
      anim.elapsed += dt;
      const t = clamp(anim.elapsed / Math.max(1e-5, anim.duration), 0, 1);

      const ownSize = cubeSizeForValue(anim.value);
      const behindDist = getEnemyTailBehindDist(enemy, anim.targetIndex, anim.value);
      const targetCumDist = enemy.pathTracker.totalDist - behindDist;
      getPointOnEnemyHeadPath(enemy, targetCumDist, state._tmpTailTargetPos);
      anim.cube.position.x = THREE.MathUtils.lerp(anim.cube.position.x, state._tmpTailTargetPos.x, 0.55);
      anim.cube.position.z = THREE.MathUtils.lerp(anim.cube.position.z, state._tmpTailTargetPos.z, 0.55);
      anim.cube.position.y = ownSize / 2;

      if (t >= 1) {
        enemy.tail.splice(anim.targetIndex, 0, anim.cube);
        enemy.tailInsertAnim = null;
        enemy.tailMergeDelayTimer = CFG.tailMergeDelaySec;
        trimEnemyTailToMax(enemy);
        // Keep ordering stable, then run merge checks gradually with effect.
        sortTailDescendingByValue(enemy.tail);
      }
    }

    if (enemy.tailMergeAnim) {
      const anim = enemy.tailMergeAnim;
      anim.elapsed += dt;
      const t = clamp(anim.elapsed / Math.max(1e-5, anim.duration), 0, 1);
      if (anim.fromCube && anim.intoCube) {
        anim.fromCube.position.x = THREE.MathUtils.lerp(anim.fromCube.position.x, anim.intoCube.position.x, 0.7);
        anim.fromCube.position.z = THREE.MathUtils.lerp(anim.fromCube.position.z, anim.intoCube.position.z, 0.7);
      }
      if (t >= 1) {
        finalizeEnemyTailMerge(enemy, anim.index);
        enemy.tailMergeAnim = null;
        sortTailDescendingByValue(enemy.tail);
      }
      return;
    }

    if (enemy.headTailMergeAnim) {
      const anim = enemy.headTailMergeAnim;
      anim.elapsed += dt;
      const t = clamp(anim.elapsed / Math.max(1e-5, anim.duration), 0, 1);
      if (anim.fromCube && enemy.mesh) {
        anim.fromCube.position.x = THREE.MathUtils.lerp(anim.fromCube.position.x, enemy.mesh.position.x, 0.7);
        anim.fromCube.position.z = THREE.MathUtils.lerp(anim.fromCube.position.z, enemy.mesh.position.z, 0.7);
      }
      if (t >= 1) {
        finalizeEnemyHeadTailMerge(enemy);
        enemy.headTailMergeAnim = null;
        sortTailDescendingByValue(enemy.tail);
      }
      return;
    }

    if (enemy.tailMergeDelayTimer > 0) {
      enemy.tailMergeDelayTimer = Math.max(0, enemy.tailMergeDelayTimer - dt);
      return;
    }

    if (applyEnemyHeadTailMerge(enemy)) return;

    const nextPair = findEnemyNextTailMergePair(enemy);
    if (nextPair >= 0) startEnemyTailMergeAnimation(enemy, nextPair);
  }

  function enemyUpdateTailPositions(enemy, dt) {
    if (!enemy.tail || enemy.tail.length === 0) return;
    if (!enemy.pathTracker || enemy.pathTracker.points.length === 0) return;

    const speedMul = CFG.gameSpeedMultiplier || 1;
    const t = smoothingT(CFG.enemyTailFollowLerpPerSecond * speedMul, dt);
    const rotT = smoothingT((CFG.enemyTailFollowLerpPerSecond || 16) * 0.9 * speedMul, dt);

    for (let i = 0; i < enemy.tail.length; i++) {
      const cube = enemy.tail[i];
      if (!cube) continue;

      const ownSize = cubeSizeForValue(cube.userData.value || 2);
      const behindDist = getEnemyTailBehindDist(enemy, i);
      const targetCumDist = enemy.pathTracker.totalDist - behindDist;
      getPointOnEnemyHeadPath(enemy, targetCumDist, state._tmpTailTargetPos);

      const nextX = THREE.MathUtils.lerp(cube.position.x, state._tmpTailTargetPos.x, t);
      const nextZ = THREE.MathUtils.lerp(cube.position.z, state._tmpTailTargetPos.z, t);
      const dx = nextX - cube.position.x;
      const dz = nextZ - cube.position.z;
      cube.position.x = nextX;
      cube.position.z = nextZ;
      cube.position.y = ownSize / 2;

      if (dx * dx + dz * dz > 1e-7) {
        const targetYaw = Math.atan2(dx, dz);
        cube.rotation.y = THREE.MathUtils.lerp(cube.rotation.y || targetYaw, targetYaw, rotT);
      }

      // Keep box up-to-date for collisions against the player.
      if (cube.userData && cube.userData.box) cube.userData.box.setFromObject(cube);
    }
  }

  function enemyMove(enemy, dt) {
    const bounds = getGroundBounds();
    let desiredDir = null;
    let speed = getEnemyMoveSpeed(enemy);

    const speedMul = CFG.gameSpeedMultiplier || 1;
    enemy.aiThinkTimer -= dt * speedMul;
    if (enemy.aiThinkTimer <= 0 || !enemy.aiMode) {
      const decision = pickEnemyDecision(enemy);
      enemy.aiMode = decision.mode;
      enemy.aiTarget = decision.target;
      const isIdle = enemy.aiMode === 'idle';
      const tMin = isIdle
        ? CFG.enemyAiIdleThinkIntervalMinSec || 0.02
        : CFG.enemyAiThinkIntervalMinSec || 0.04;
      const tMax = isIdle
        ? CFG.enemyAiIdleThinkIntervalMaxSec || 0.06
        : CFG.enemyAiThinkIntervalMaxSec || 0.1;
      enemy.aiThinkTimer = THREE.MathUtils.lerp(tMin, tMax, Math.random());
    }

    if (enemy.aiMode === 'escape' && enemy.aiTarget) {
      state._tmpMoveDir.set(
        enemy.mesh.position.x - enemy.aiTarget.x,
        0,
        enemy.mesh.position.z - enemy.aiTarget.z
      );
      if (state._tmpMoveDir.lengthSq() > 1e-6) {
        desiredDir = state._tmpMoveDir.normalize().clone();
        speed *= CFG.enemyEscapeSpeedMultiplier || 1.15;
      }
    } else if (enemy.aiMode === 'hunt_agent' && enemy.aiTarget) {
      state._tmpMoveDir.set(
        enemy.aiTarget.x - enemy.mesh.position.x,
        0,
        enemy.aiTarget.z - enemy.mesh.position.z
      );
      if (state._tmpMoveDir.lengthSq() > 1e-6) desiredDir = state._tmpMoveDir.normalize().clone();
    } else if (enemy.aiMode === 'hunt_cube' && enemy.aiTarget && enemy.aiTarget.position) {
      state._tmpMoveDir.set(
        enemy.aiTarget.position.x - enemy.mesh.position.x,
        0,
        enemy.aiTarget.position.z - enemy.mesh.position.z
      );
      if (state._tmpMoveDir.lengthSq() > 1e-6) desiredDir = state._tmpMoveDir.normalize().clone();
    }

    enemy.dirChangeTimer -= dt * speedMul;
    if (!desiredDir && enemy.dirChangeTimer <= 0) {
      enemyPickRandomDir(enemy);
      enemy.dirChangeTimer = CFG.enemyDirChangeEverySec * (0.6 + Math.random() * 0.9) / speedMul;
    } else if (desiredDir) {
      const steerT = smoothingT(CFG.enemySteerLerpPerSecond || 8, dt);
      enemy.dir.lerp(desiredDir, steerT);
      if (enemy.dir.lengthSq() > 1e-6) enemy.dir.normalize();
    }

    let nx = enemy.mesh.position.x + enemy.dir.x * speed * dt;
    let nz = enemy.mesh.position.z + enemy.dir.z * speed * dt;

    if (nx < bounds.minX) {
      nx = bounds.minX;
      enemy.dir.x *= -1;
    } else if (nx > bounds.maxX) {
      nx = bounds.maxX;
      enemy.dir.x *= -1;
    }

    if (nz < bounds.minZ) {
      nz = bounds.minZ;
      enemy.dir.z *= -1;
    } else if (nz > bounds.maxZ) {
      nz = bounds.maxZ;
      enemy.dir.z *= -1;
    }

    enemy.mesh.position.set(nx, cubeSizeForValue(enemy.value) / 2, nz);
    enemy.mesh.rotation.y = Math.atan2(enemy.dir.x, enemy.dir.z);
  }

  function enemyCollectCubesAndTail(enemy) {
    if (!enemy.mesh || state.cubes.length === 0) return;

    // Head intersection with static collectible cubes.
    const headBox = enemy.headBox;
    headBox.setFromObject(enemy.mesh);

    const tailValuesToAdd = [];

    const remaining = [];
    for (const cube of state.cubes) {
      if (!cube || !cube.userData || !cube.userData.box) {
        remaining.push(cube);
        continue;
      }

      if (!headBox.intersectsBox(cube.userData.box)) {
        remaining.push(cube);
        continue;
      }

      const v = cube.userData.value;
      if (v > enemy.value) {
        remaining.push(cube);
        continue;
      }

      // Collected
      state.scene.remove(cube);
      tailValuesToAdd.push(v);
    }

    state.cubes = remaining;

    for (const v of tailValuesToAdd) enqueueEnemyTailValue(enemy, v);
  }

  function scatterEnemyTail(enemy) {
    if (!enemy.tail || enemy.tail.length === 0) return;

    for (const cube of enemy.tail) {
      if (!cube) continue;
      const a = Math.random() * Math.PI * 2;
      const s = CFG.enemyTailScatterSpeed * (0.75 + Math.random() * 0.5);
      cube.userData.scatterVel = new THREE.Vector3(Math.cos(a) * s, 0, Math.sin(a) * s);
      cube.userData.scatterLife0 = CFG.enemyTailScatterLifeSec * (0.7 + Math.random() * 0.6);
      cube.userData.scatterLife = cube.userData.scatterLife0;
      cube.userData.scatterRotVel = new THREE.Vector3(
        (Math.random() * 2 - 1) * 3,
        (Math.random() * 2 - 1) * 3,
        (Math.random() * 2 - 1) * 3
      );

      // Detach from enemy tail-follow system.
      state.scatterCubes.push(cube);
    }

    enemy.tail.length = 0;

    // Optional: tiny head reaction to emphasize the hit.
    enemy.headPulseTime = CFG.enemyHeadPulseDurationSec;
  }

  function updateScatterCubes(dt) {
    if (!state.scatterCubes || state.scatterCubes.length === 0) return;

    const bounds = getGroundBounds();

    for (let i = state.scatterCubes.length - 1; i >= 0; i--) {
      const cube = state.scatterCubes[i];
      if (!cube) {
        state.scatterCubes.splice(i, 1);
        continue;
      }

      cube.userData.scatterLife -= dt;
      if (cube.userData.scatterLife <= 0) {
        state.scene.remove(cube);
        state.scatterCubes.splice(i, 1);
        continue;
      }

      cube.position.x += cube.userData.scatterVel.x * dt;
      cube.position.z += cube.userData.scatterVel.z * dt;

      // Damping
      const damping = Math.exp(-CFG.enemyTailScatterDamping * dt);
      cube.userData.scatterVel.multiplyScalar(damping);

      // Bounds reflect (simple)
      if (cube.position.x < bounds.minX) {
        cube.position.x = bounds.minX;
        cube.userData.scatterVel.x *= -0.45;
      } else if (cube.position.x > bounds.maxX) {
        cube.position.x = bounds.maxX;
        cube.userData.scatterVel.x *= -0.45;
      }

      if (cube.position.z < bounds.minZ) {
        cube.position.z = bounds.minZ;
        cube.userData.scatterVel.z *= -0.45;
      } else if (cube.position.z > bounds.maxZ) {
        cube.position.z = bounds.maxZ;
        cube.userData.scatterVel.z *= -0.45;
      }

      cube.position.y = CFG.cubeSize / 2;

      const rv = cube.userData.scatterRotVel;
      cube.rotation.x += rv.x * dt;
      cube.rotation.y += rv.y * dt;
      cube.rotation.z += rv.z * dt;
    }
  }

  function finishPlayerRespawn() {
    if (!state.player) return;

    state.playerPendingRespawn = false;
    state.playerDeathFollowTimer = 0;
    state.playerDeathFollowTarget = null;

    state.player.visible = true;

    const bounds = getGroundBounds();
    let x = 0;
    let z = 0;
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
      z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
      let ok = true;
      for (const e of state.enemies) {
        if (!e || !e.mesh) continue;
        const dx = x - e.mesh.position.x;
        const dz = z - e.mesh.position.z;
        if (dx * dx + dz * dz < 18 * 18) {
          ok = false;
          break;
        }
      }
      if (ok) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
      z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
    }
    state.player.position.set(x, cubeSizeForValue(state.playerValue) / 2, z);

    if (state.playerPathTracker) {
      state.playerPathTracker.hasLastSample = false;
      state.playerPathTracker.points.length = 0;
      state.playerPathTracker.totalDist = 0;
    }
    recordHeadPathPoint();
  }

  function resetPlayerAfterEaten(killerEnemy = null) {
    if (!state.player) return;

    state.playerValue = CFG.enemyStartValue;
    state.score = 2;
    if (state.player.userData && state.player.userData.entity) {
      state.player.userData.entity.setValue(state.playerValue);
    }
    updatePlayerNumberTexture(state.playerValue);
    const s = cubeSizeForValue(state.playerValue) / CFG.cubeSize;
    state.player.userData.baseScale = s;
    state.player.scale.setScalar(s);
    updatePlayerNameTagPosition();

    for (const seg of state.tail) if (seg) state.scene.remove(seg);
    state.tail.length = 0;
    state.tailInsertQueue.length = 0;
    state.tailInsertAnim = null;
    state.tailMergeAnim = null;
    state.headTailMergeAnim = null;
    state.tailMergeDelayTimer = 0;
    state.playerPendingRespawn = true;
    state.playerDeathFollowTimer = Math.max(0, CFG.playerDeathFollowSeconds || 0);
    state.playerDeathFollowTarget = killerEnemy && killerEnemy.mesh ? killerEnemy.mesh : null;
    state.player.visible = false;
    state.pointerHasPosition = false;

    if (state.playerDeathFollowTimer <= 0) finishPlayerRespawn();
  }

  function resetEnemyAfterEaten(enemy) {
    if (!enemy || !enemy.mesh) return;

    for (const seg of enemy.tail) if (seg) state.scene.remove(seg);
    enemy.tail.length = 0;
    enemy.tailInsertQueue.length = 0;
    enemy.tailInsertAnim = null;
    enemy.tailMergeAnim = null;
    enemy.headTailMergeAnim = null;
    enemy.tailMergeDelayTimer = 0;
    enemy.aiMode = 'idle';
    enemy.aiTarget = null;
    enemy.aiThinkTimer = 0;

    enemy.value = CFG.enemyStartValue;
    if (enemy.mesh.userData && enemy.mesh.userData.entity) {
      enemy.mesh.userData.entity.setValue(enemy.value);
    }
    updateCubeNumberTexture(enemy.mesh, enemy.value);
    const s = cubeSizeForValue(enemy.value) / CFG.cubeSize;
    enemy.mesh.userData.baseScale = s;
    enemy.mesh.scale.setScalar(s);
    updateEnemyNameTagPosition(enemy);

    const bounds = getGroundBounds();
    const respawnSize = cubeSizeForValue(enemy.value);
    const minSep = respawnSize * 0.9 + CFG.cubeSize * 0.6;
    const minSepSq = minSep * minSep;
    let x = 0;
    let z = 0;
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
      z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
      // Keep away from the main player.
      if (state.player && state.player.position) {
        const dxp = x - state.player.position.x;
        const dzp = z - state.player.position.z;
        if (dxp * dxp + dzp * dzp < (respawnSize * 0.8) * (respawnSize * 0.8)) continue;
      }
      // Keep away from other PCs to avoid immediate chain collisions.
      let ok = true;
      for (const other of state.enemies) {
        if (!other || other === enemy || !other.mesh) continue;
        const dx = x - other.mesh.position.x;
        const dz = z - other.mesh.position.z;
        if (dx * dx + dz * dz < minSepSq) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      placed = true;
      break;
    }
    if (!placed) {
      x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
      z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
    }
    enemy.mesh.position.set(x, cubeSizeForValue(enemy.value) / 2, z);
    enemyPickRandomDir(enemy);
    enemy.headPulseTime = CFG.enemyHeadPulseDurationSec;
    if (enemy.pathTracker) {
      enemy.pathTracker.hasLastSample = false;
      enemy.pathTracker.points.length = 0;
      enemy.pathTracker.totalDist = 0;
    }
    enemyRecordHeadPathPoint(enemy);
  }

  function checkPlayerHitEnemyTail() {
    if (!state.player || state.playerPendingRespawn) return;

    const playerBox = state._playerBox;
    playerBox.setFromObject(state.player);

    for (const enemy of state.enemies) {
      if (!enemy.tail || enemy.tail.length === 0) continue;

      for (const seg of enemy.tail) {
        if (!seg || !seg.userData || !seg.userData.box) continue;

        // Box should already be updated in enemyUpdateTailPositions().
        if (playerBox.intersectsBox(seg.userData.box)) {
          const segValue = seg.userData.value || 0;
          const segSize = cubeSizeForValue(segValue);
          const playerSize = cubeSizeForValue(state.playerValue);
          if (segValue <= state.playerValue) {
            // Eat when tail segment value is smaller or equal to player value.
            const idx = enemy.tail.indexOf(seg);
            if (idx >= 0) enemy.tail.splice(idx, 1);
            state.scene.remove(seg);
            enqueueTailValue(segValue);
          } else {
            // Bigger/equal segment: do not destroy enemy tail, just resolve overlap.
            const dx = state.player.position.x - seg.position.x;
            const dz = state.player.position.z - seg.position.z;
            const d2 = dx * dx + dz * dz;
            let nx = 0;
            let nz = 0;
            if (d2 > 1e-8) {
              const invLen = 1 / Math.sqrt(d2);
              nx = dx * invLen;
              nz = dz * invLen;
            } else {
              nx = state.playerMoveDir.x;
              nz = state.playerMoveDir.z;
            }

            const targetGap = playerSize / 2 + segSize / 2 + 0.01;
            const actualDist = Math.sqrt(Math.max(d2, 1e-8));
            const penetration = targetGap - actualDist;
            if (penetration > 0) {
              const bounds = getGroundBounds();
              state.player.position.x = clamp(
                state.player.position.x + nx * penetration,
                bounds.minX,
                bounds.maxX
              );
              state.player.position.z = clamp(
                state.player.position.z + nz * penetration,
                bounds.minZ,
                bounds.maxZ
              );
              state.player.position.y = playerSize / 2;
              if (nx * nx + nz * nz > 1e-8) {
                state.playerMoveDir.set(nx, 0, nz).normalize();
              }
            }
          }

          // Give the player feedback.
          state.playerPulseTime = CFG.playerPulseDurationSec;

          updateHud();
          return;
        }
      }
    }
  }

  function checkPlayerVsEnemyHeads() {
    if (!state.player || state.playerPendingRespawn || !state.enemies || state.enemies.length === 0) return;

    const playerBox = state._playerBox;
    playerBox.setFromObject(state.player);

    for (let i = state.enemies.length - 1; i >= 0; i--) {
      const enemy = state.enemies[i];
      if (!enemy || !enemy.mesh) continue;

      enemy.headBox.setFromObject(enemy.mesh);
      if (!playerBox.intersectsBox(enemy.headBox)) continue;

      const playerSize = cubeSizeForValue(state.playerValue);
      const enemySize = cubeSizeForValue(enemy.value);
      if (playerSize > enemySize) {
        // Player eats smaller PC enemy then enemy respawns as small.
        enqueueTailValue(enemy.value);
        state.killCount += 1;
        showEatEvent(CFG.playerName, enemy.label || `PC ${i + 1}`);
        resetEnemyAfterEaten(enemy);
        state.playerPulseTime = CFG.playerPulseDurationSec;
        updateHud();
      } else if (playerSize < enemySize) {
        // Bigger PC enemy eats player then player respawns as small.
        enqueueEnemyTailValue(enemy, state.playerValue);
        showEatEvent(enemy.label || `PC ${i + 1}`, CFG.playerName);
        resetPlayerAfterEaten(enemy);
        enemy.headPulseTime = CFG.enemyHeadPulseDurationSec;
        updateHud();
        return;
      } else {
        // Same size: collide and repel (no one eats the other).
        const dx = enemy.mesh.position.x - state.player.position.x;
        const dz = enemy.mesh.position.z - state.player.position.z;
        const lenSq = dx * dx + dz * dz;
        let nx = 0;
        let nz = 0;
        if (lenSq > 1e-8) {
          const invLen = 1 / Math.sqrt(lenSq);
          nx = dx * invLen;
          nz = dz * invLen;
        } else {
          nx = state.playerMoveDir.x;
          nz = state.playerMoveDir.z;
        }

        const playerSize = cubeSizeForValue(state.playerValue);
        const enemySize = cubeSizeForValue(enemy.value);
        // Prevent overlap: center distance should be at least sum of half-sizes.
        const targetGap = playerSize / 2 + enemySize / 2 + 0.01;
        const actualDist = Math.sqrt(Math.max(lenSq, 1e-8));
        const penetration = targetGap - actualDist;
        const move = Math.max(0.01, penetration / 2);

        const bounds = getGroundBounds();
        state.player.position.x = clamp(
          state.player.position.x - nx * move,
          bounds.minX,
          bounds.maxX
        );
        state.player.position.z = clamp(
          state.player.position.z - nz * move,
          bounds.minZ,
          bounds.maxZ
        );
        enemy.mesh.position.x = clamp(enemy.mesh.position.x + nx * move, bounds.minX, bounds.maxX);
        enemy.mesh.position.z = clamp(enemy.mesh.position.z + nz * move, bounds.minZ, bounds.maxZ);
        state.player.position.y = playerSize / 2;
        enemy.mesh.position.y = enemySize / 2;

        // Both bounce to opposite directions.
        state.playerMoveDir.set(-nx, 0, -nz).normalize();
        enemy.dir.set(nx, 0, nz).normalize();
        state.playerPulseTime = CFG.playerPulseDurationSec;
        enemy.headPulseTime = CFG.enemyHeadPulseDurationSec;
      }
    }
  }

  function updateEnemies(dt) {
    if (!state.enemies || state.enemies.length === 0) return;

    for (const enemy of state.enemies) {
      if (!enemy || !enemy.mesh) continue;

      enemyMove(enemy, dt);
      enemyRecordHeadPathPoint(enemy);
      enemyCollectCubesAndTail(enemy);
      updateEnemyTailFeedingFlow(enemy, dt);
      enemyUpdateTailPositions(enemy, dt);
      applyEnemyHeadPulse(enemy, dt);
    }
  }

  function handleEnemyVsEnemyInteractions() {
    if (!state.enemies || state.enemies.length < 2) return;

    const bounds = getGroundBounds();
    const EPS = 1e-6;
    const sizeEqEps = 0.001;

    const repelHeads = (a, b, sizeA, sizeB) => {
      const dx = b.mesh.position.x - a.mesh.position.x;
      const dz = b.mesh.position.z - a.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < EPS) return;
      const dist = Math.sqrt(d2);

      const halfSum = (sizeA + sizeB) / 2;
      const penetration = halfSum - dist;
      if (penetration <= 0) return;

      const nx = dx / dist;
      const nz = dz / dist;
      const push = penetration / 2;

      a.mesh.position.x = clamp(a.mesh.position.x - nx * push, bounds.minX, bounds.maxX);
      a.mesh.position.z = clamp(a.mesh.position.z - nz * push, bounds.minZ, bounds.maxZ);
      b.mesh.position.x = clamp(b.mesh.position.x + nx * push, bounds.minX, bounds.maxX);
      b.mesh.position.z = clamp(b.mesh.position.z + nz * push, bounds.minZ, bounds.maxZ);

      // Update directions to visually "bounce" away.
      a.dir.set(-nx, 0, -nz).normalize();
      b.dir.set(nx, 0, nz).normalize();
      a.headPulseTime = CFG.enemyHeadPulseDurationSec;
      b.headPulseTime = CFG.enemyHeadPulseDurationSec;
    };

    const eatEnemyHead = (eater, eaten) => {
      const val = eaten.value;
      // Grow eater tail by eaten head value.
      enqueueEnemyTailValue(eater, val);
      eater.headPulseTime = CFG.enemyHeadPulseDurationSec;
      // Remove eaten head and tail by respawning it.
      resetEnemyAfterEaten(eaten);
    };

    // Head-head interactions.
    for (let i = 0; i < state.enemies.length; i++) {
      const a = state.enemies[i];
      if (!a || !a.mesh) continue;
      const sizeA = cubeSizeForValue(a.value);

      for (let j = i + 1; j < state.enemies.length; j++) {
        const b = state.enemies[j];
        if (!b || !b.mesh) continue;
        const sizeB = cubeSizeForValue(b.value);

        const dx = b.mesh.position.x - a.mesh.position.x;
        const dz = b.mesh.position.z - a.mesh.position.z;
        const d2 = dx * dx + dz * dz;
        const halfSum = (sizeA + sizeB) / 2;
        const halfSumSq = halfSum * halfSum;

        if (d2 <= halfSumSq + 1e-6) {
          if (Math.abs(sizeA - sizeB) <= sizeEqEps) {
            repelHeads(a, b, sizeA, sizeB);
          } else if (sizeA > sizeB) {
            eatEnemyHead(a, b);
          } else {
            eatEnemyHead(b, a);
          }
        }
      }
    }

    // Head-tail interactions (larger head eats smaller tail segments).
    // Use AABB/Box3 where available to avoid false positives.
    for (const eater of state.enemies) {
      if (!eater || !eater.mesh || !eater.tail) continue;
      const eaterSize = cubeSizeForValue(eater.value);
      for (const other of state.enemies) {
        if (!other || other === eater || !other.tail) continue;

        // Ensure headBox exists.
        eater.headBox.setFromObject(eater.mesh);

        for (let k = other.tail.length - 1; k >= 0; k--) {
          const seg = other.tail[k];
          if (!seg || !seg.userData || !seg.userData.box) continue;

          const segValue = seg.userData.value || 0;
          const segSize = cubeSizeForValue(segValue);
          const dx = seg.position.x - eater.mesh.position.x;
          const dz = seg.position.z - eater.mesh.position.z;
          const d2 = dx * dx + dz * dz;
          const halfSum = (eaterSize + segSize) / 2;
          if (d2 > halfSum * halfSum) continue;

          if (!eater.headBox.intersectsBox(seg.userData.box)) continue;

          if (segSize + sizeEqEps < eaterSize) {
            // Eat segment.
            other.tail.splice(k, 1);
            state.scene.remove(seg);
            enqueueEnemyTailValue(eater, segValue);
            eater.headPulseTime = CFG.enemyHeadPulseDurationSec;
          } else if (Math.abs(segSize - eaterSize) <= sizeEqEps) {
            // Same size: repel head slightly away to avoid overlap jitter.
            const dx = seg.position.x - eater.mesh.position.x;
            const dz = seg.position.z - eater.mesh.position.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > EPS) {
              const dist = Math.sqrt(d2);
              const halfSum = (eaterSize + segSize) / 2;
              const penetration = halfSum - dist;
              if (penetration > 0) {
                const nx = dx / dist;
                const nz = dz / dist;
                eater.mesh.position.x = clamp(eater.mesh.position.x - nx * (penetration / 2), bounds.minX, bounds.maxX);
                eater.mesh.position.z = clamp(eater.mesh.position.z - nz * (penetration / 2), bounds.minZ, bounds.maxZ);
                eater.dir.set(-nx, 0, -nz).normalize();
              }
            }
          }
        }
      }
    }
  }

  function spawnEnemies(count) {
    // Clean up (if re-spawning in future).
    if (state.enemies.length > 0) {
      for (const e of state.enemies) {
        if (!e) continue;
        if (e.mesh) state.scene.remove(e.mesh);
        if (e.tail) {
          for (const t of e.tail) if (t) state.scene.remove(t);
        }
      }
      state.enemies.length = 0;
    }
    if (state.scatterCubes.length > 0) {
      for (const c of state.scatterCubes) if (c) state.scene.remove(c);
      state.scatterCubes.length = 0;
    }

    const bounds = getGroundBounds();

    const trySpawnAt = (x, z) => {
      // Keep away from player & other enemies to reduce instant collisions.
      const minDist = CFG.groundSize * 0.06;
      const p = state.player.position;
      const dxp = x - p.x;
      const dzp = z - p.z;
      if (dxp * dxp + dzp * dzp < minDist * minDist) return false;

      for (const e of state.enemies) {
        const ex = e.mesh.position.x;
        const ez = e.mesh.position.z;
        const dx = x - ex;
        const dz = z - ez;
        if (dx * dx + dz * dz < (minDist * 0.85) * (minDist * 0.85)) return false;
      }
      return true;
    };

    const randomEnemyTotalValue = () => {
      // Build each PC from one random total value, then distribute to head/tail.
      const totalUnits = THREE.MathUtils.randInt(8, 640); // 16..1280 (step 2)
      return totalUnits * 2;
    };

    const splitTotalIntoDescendingValues = (totalValue) => {
      // Greedy power-of-two split keeps values naturally descending:
      // head is largest, then near-tail, then farther-tail.
      let remaining = Math.max(2, Math.floor(totalValue / 2) * 2);
      const parts = [];
      while (remaining >= 2) {
        const part = 2 ** Math.floor(Math.log2(remaining));
        parts.push(part);
        remaining -= part;
      }
      return parts;
    };

    const buildRandomEnemyProgression = () => {
      const total = randomEnemyTotalValue();
      const parts = splitTotalIntoDescendingValues(total);
      return {
        total,
        headValue: parts[0] || 2,
        tailValues: parts.slice(1)
      };
    };

    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      let ok = false;

      for (let attempt = 0; attempt < 60; attempt++) {
        x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
        z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
        if (trySpawnAt(x, z)) {
          ok = true;
          break;
        }
      }

      if (!ok) {
        x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, Math.random());
        z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, Math.random());
      }

      const enemyStartSize = cubeSizeForValue(CFG.enemyStartValue);
      const head = createNumberedCube(CFG.enemyStartValue, enemyStartSize);
      attachCubeEntity(head, CubeEntity.TYPES.HEAD, CFG.enemyStartValue, enemyStartSize);
      head.position.set(x, enemyStartSize / 2, z);
      head.userData.box = new THREE.Box3().setFromObject(head);
      state.scene.add(head);

      const enemy = new EnemyAgent(head, CFG);
      enemy.label = `PC ${i + 1}`;

      enemy.nameTag = makeNameTagSprite(enemy.label);
      enemy.mesh.add(enemy.nameTag);
      enemyPickRandomDir(enemy);
      enemy.mesh.rotation.y = Math.atan2(enemy.dir.x, enemy.dir.z);

      // Spawn from one random total, then distribute descending:
      // head is largest, then nearest tail segment, and so on.
      const progression = buildRandomEnemyProgression();
      const headValue = progression.headValue;
      enemy.value = headValue;
      if (enemy.mesh.userData && enemy.mesh.userData.entity) {
        enemy.mesh.userData.entity.setValue(headValue);
      }
      updateCubeNumberTexture(enemy.mesh, headValue);
      const headScale = cubeSizeForValue(headValue) / CFG.cubeSize;
      enemy.mesh.userData.baseScale = headScale;
      enemy.mesh.scale.setScalar(headScale);
      enemy.mesh.position.y = cubeSizeForValue(headValue) / 2;
      updateEnemyNameTagPosition(enemy);

      for (const tailValue of progression.tailValues) {
        addEnemyTailCube(enemy, tailValue);
      }
      normalizeTailByRules(enemy.tail);

      // Place tail immediately behind the head to avoid initial pile-up.
      for (let t = 0; t < enemy.tail.length; t++) {
        const seg = enemy.tail[t];
        if (!seg) continue;
        const segDist = getEnemyTailBehindDist(enemy, t);
        const segSize = cubeSizeForValue(seg.userData?.value || 2);
        seg.position.set(
          enemy.mesh.position.x - enemy.dir.x * segDist,
          segSize / 2,
          enemy.mesh.position.z - enemy.dir.z * segDist
        );
        seg.rotation.y = enemy.mesh.rotation.y;
        if (seg.userData && seg.userData.box) seg.userData.box.setFromObject(seg);
      }

      // Seed head path so tail follows immediately if/when it grows.
      if (enemy.pathTracker) {
        enemy.pathTracker.hasLastSample = false;
        enemy.pathTracker.points.length = 0;
        enemy.pathTracker.totalDist = 0;
      }
      enemyRecordHeadPathPoint(enemy);

      state.enemies.push(enemy);
    }
  }

  function createGround() {
    function createPlaygroundTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // Match the provided reference: muted purple base with dark soft spots.
      const baseColor = '#604A5A';
      const spotColor = '#4A3646';

      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const spots = [
        { x: 88, y: 72, r: 24 },
        { x: 54, y: 230, r: 15 },
        { x: 408, y: 210, r: 16 },
        { x: 266, y: 420, r: 30 }
      ];

      for (const spot of spots) {
        ctx.beginPath();
        ctx.fillStyle = spotColor;
        ctx.globalAlpha = 0.42;
        ctx.ellipse(spot.x, spot.y, spot.r, Math.max(spot.r * 0.65, 6), 0, 0, Math.PI * 2);
        ctx.fill();

        // Slightly darker core for depth similar to the sample.
        ctx.beginPath();
        ctx.fillStyle = '#3D2C3A';
        ctx.globalAlpha = 0.3;
        ctx.ellipse(spot.x, spot.y, spot.r * 0.58, Math.max(spot.r * 0.38, 4), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(10, 10);
      tex.anisotropy = state.renderer.capabilities.getMaxAnisotropy();
      return tex;
    }

    const planeGeo = new THREE.PlaneGeometry(CFG.groundSize, CFG.groundSize);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: createPlaygroundTexture(),
      roughness: 0.95,
      metalness: 0.0
    });

    const plane = new THREE.Mesh(planeGeo, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0;
    plane.receiveShadow = true;
    state.ground = plane;
    state.scene.add(plane);

    // Softer grid to complement the ground
    const grid = new THREE.GridHelper(CFG.gridSize, CFG.gridDivisions, 0xbfc5bb, 0xbfc5bb);
    grid.material.transparent = true;
    grid.material.opacity = 0.05;
    grid.position.y = 0.001; // prevent z-fighting with the plane
    state.grid = grid;
    state.scene.add(grid);

    const playHalf = (CFG.playAreaSize || CFG.groundSize) / 2;
    const y = 0.02; // tiny offset to prevent z-fighting with ground
    const borderPoints = [
      new THREE.Vector3(-playHalf, y, -playHalf),
      new THREE.Vector3(playHalf, y, -playHalf),
      new THREE.Vector3(playHalf, y, playHalf),
      new THREE.Vector3(-playHalf, y, playHalf)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x9fb3a2,
      transparent: true,
      opacity: 0.6
    });
    const border = new THREE.LineLoop(borderGeo, borderMat);
    state.scene.add(border);
  }

  function createPlayer() {
    const size = cubeSizeForValue(2);
    state.playerValue = 2;
    const cube = createNumberedCube(2, size);
    cube.position.set(0, size / 2, 0);
    cube.castShadow = true;
    attachCubeEntity(cube, CubeEntity.TYPES.HEAD, 2, size);
    cube.userData.baseScale = size / CFG.cubeSize;
    cube.scale.setScalar(cube.userData.baseScale);

    state.player = cube;
    state.playerNameTag = makeNameTagSprite(CFG.playerName);
    state.player.add(state.playerNameTag);
    updatePlayerNameTagPosition();
    state.scene.add(cube);
  }

  function updateCameraImmediate() {
    const p = state.player.position;
    state.camera.position.copy(state.cameraPosTarget);
    state.camera.lookAt(p.x, p.y, p.z);
  }

  function handleInput() {
    window.addEventListener(
      'pointermove',
      (e) => {
        state.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
        state.pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
        state.pointerHasPosition = true;
      },
      { passive: true }
    );

    window.addEventListener('blur', () => {
      state.pointerHasPosition = false;
    });
  }

  function update(dt) {
    if (!state.player || !state.ground) return;

    const isRespawnPending = state.playerPendingRespawn;

    if (!isRespawnPending) {
      // Mouse only steers movement direction; player always moves forward.
      if (state.pointerHasPosition) {
        state.raycaster.setFromCamera(state.pointerNdc, state.camera);
        state.raycaster.far = CFG.raycastMaxDistance;
        const hits = state.raycaster.intersectObject(state.ground, false);
        if (hits && hits.length > 0) {
          const hitPoint = hits[0].point;
          state._tmpMoveDir.set(
            hitPoint.x - state.player.position.x,
            0,
            hitPoint.z - state.player.position.z
          );
          if (state._tmpMoveDir.lengthSq() > 1e-6) {
            state._tmpMoveDir.normalize();
            const steerT = smoothingT(CFG.steerLerpPerSecond, dt);
            state.playerMoveDir.lerp(state._tmpMoveDir, steerT).normalize();
          }
        }
      }

      const playerSpeed = getPlayerMoveSpeed();
      state.player.position.x += state.playerMoveDir.x * playerSpeed * dt;
      state.player.position.z += state.playerMoveDir.z * playerSpeed * dt;
      state.player.rotation.y = Math.atan2(state.playerMoveDir.x, state.playerMoveDir.z);

      const bounds = getGroundBounds();
      state.player.position.x = clamp(state.player.position.x, bounds.minX, bounds.maxX);
      state.player.position.z = clamp(state.player.position.z, bounds.minZ, bounds.maxZ);
      state.player.position.y = cubeSizeForValue(state.playerValue) / 2;
    }

    state.gameTimeSec += dt;

    let followEnemy = null;
    let focusObject = state.player;
    let focusValue = state.playerValue;
    let focusTail = state.tail;
    if (isRespawnPending && state.playerDeathFollowTarget) {
      followEnemy = state.enemies.find((enemy) => enemy && enemy.mesh === state.playerDeathFollowTarget) || null;
      if (followEnemy && followEnemy.mesh) {
        focusObject = followEnemy.mesh;
        focusValue = followEnemy.value;
        focusTail = followEnemy.tail;
      }
    }

    // Dynamic camera that zooms out as average followed snake block size increases.
    let totalSize = cubeSizeForValue(focusValue);
    let totalCount = 1;
    for (const seg of focusTail) {
      if (!seg || !seg.userData) continue;
      totalSize += cubeSizeForValue(seg.userData.value || 2);
      totalCount += 1;
    }
    const avgSize = totalSize / Math.max(1, totalCount);
    const sizeRatio = avgSize / Math.max(0.0001, CFG.cubeSize);
    const zoomLevel = Math.max(0, Math.log2(sizeRatio));
    const orthoBaseHalfH = CFG.orthoBaseSize || 40;
    const zoomScale = 1 + zoomLevel * (CFG.cameraZoomBySizeFactor || 11) * 0.03;
    const targetHalfH = orthoBaseHalfH * zoomScale;

    const halfHT = smoothingT((CFG.cameraLerpPerSecond || 6) * 0.8, dt);
    const currentHalfH = state.camera.top ?? orthoBaseHalfH;
    const nextHalfH = THREE.MathUtils.lerp(currentHalfH, targetHalfH, halfHT);

    state._orthoHalfH = nextHalfH;
    const aspectNow = window.innerWidth / window.innerHeight;
    state.camera.top = nextHalfH;
    state.camera.bottom = -nextHalfH;
    state.camera.left = -nextHalfH * aspectNow;
    state.camera.right = nextHalfH * aspectNow;
    state.camera.updateProjectionMatrix();

    const offsetScale = 1 + zoomLevel * (CFG.cameraOffsetScaleBySize || 0.42);

    const p = focusObject.position;
    state.cameraPosTarget.set(
      p.x + (CFG.cameraWorldOffsetX || 0),
      p.y + (CFG.cameraWorldOffsetY || 70) * offsetScale,
      p.z + (CFG.cameraWorldOffsetZ || 90) * offsetScale
    );

    const camT = smoothingT(CFG.cameraLerpPerSecond, dt);
    state.camera.position.lerp(state.cameraPosTarget, camT);

    if (state.freeCubeSpawner) {
      const speedMul = CFG.gameSpeedMultiplier || 1;
      state.freeCubeSpawner.update(dt * speedMul);
    }

    if (!isRespawnPending) {
      // Collectible cubes -> tail growth.
      handleCollectibleCubesAndTail();

      // Record the player's movement path and update the tail behind it.
      recordHeadPathPoint();
      updateTailFeedingFlow(dt);
      updateTailPositions(dt);
    }

    updateEnemies(dt);
    handleEnemyVsEnemyInteractions();
    if (!isRespawnPending) {
      checkPlayerVsEnemyHeads();
      checkPlayerHitEnemyTail();
    } else {
      state.playerDeathFollowTimer -= dt;
      if (state.playerDeathFollowTimer <= 0) finishPlayerRespawn();
    }

    updateScatterCubes(dt);
    applyPlayerPulse(dt);
    updateHud();
  }

  function render() {
    state.renderer.render(state.scene, state.camera);
  }

  function onResize() {
    if (!state.renderer || !state.camera) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    if (state.camera.isOrthographicCamera) {
      const halfH = state._orthoHalfH ?? (CFG.orthoBaseSize || 40);
      state.camera.left = -halfH * aspect;
      state.camera.right = halfH * aspect;
      state.camera.top = halfH;
      state.camera.bottom = -halfH;
    } else {
      state.camera.aspect = aspect;
    }
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h, false);
  }

  function init() {
    if (state.initialized) return;

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xeae7df);
    state.scene.fog = new THREE.Fog(0xeae7df, 260, 1400);

    // Use OrthographicCamera for stable, arcade-like view.
    const aspectNow = window.innerWidth / window.innerHeight;
    const halfH = CFG.orthoBaseSize || 40;
    state.camera = new THREE.OrthographicCamera(
      -halfH * aspectNow,
      halfH * aspectNow,
      halfH,
      -halfH,
      0.1,
      2000
    );
    state._orthoHalfH = halfH;

    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    state.renderer.setSize(window.innerWidth, window.innerHeight, false);
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.2;

    // Full-screen canvas behavior (independent from any app layout/CSS).
    const canvas = state.renderer.domElement;
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.zIndex = '0';

    const mount = document.getElementById('app') || document.body;
    mount.appendChild(canvas);

    // Lighting for shaded cubes
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    state.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    state.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.radius = 4;
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 120;
    state.scene.add(dir);

    createGround();
    createPlayer();
    state.playerPathTracker = new PathTracker(CFG);
    state.freeCubeSpawner = new FreeCubeSpawner({
      cfg: CFG,
      scene: state.scene,
      createNumberedCube,
      cubeSizeForValue,
      getGroundBounds,
      getCubes: () => state.cubes,
      setCubes: (next) => {
        state.cubes = next;
      }
    });

    initHud();

    // Seed tail path history so tail can follow immediately after it grows.
    state.tail.length = 0;
    if (state.playerPathTracker) {
      state.playerPathTracker.hasLastSample = false;
      state.playerPathTracker.points.length = 0;
      state.playerPathTracker.totalDist = 0;
    }
    recordHeadPathPoint();

    state.freeCubeSpawner.seed(CFG.collectibleCubeCount);
    spawnEnemies(CFG.enemyCount);

    state.raycaster = new THREE.Raycaster();

    // Camera starts at a fixed world direction for an always same angle feel.
    state.cameraPosTarget.set(
      CFG.cameraWorldOffsetX || 0,
      CFG.cameraWorldOffsetY || 70,
      CFG.cameraWorldOffsetZ || 90
    );
    state.camera.position.copy(state.cameraPosTarget);
    state.camera.lookAt(0, cubeSizeForValue(state.playerValue) / 2, CFG.cameraLookAheadZ || 0);

    handleInput();

    window.addEventListener('resize', onResize, { passive: true });
    onResize();

    state.initialized = true;
  }

  function loop(now) {
    if (!state.lastTime) state.lastTime = now;
    const dtRaw = clamp((now - state.lastTime) / 1000, 0, 0.05);
    const dt = dtRaw; // keep animation timing consistent
    state.lastTime = now;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  init();
  requestAnimationFrame(loop);
}