export function createCollisionsSystem({
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
  multiplayerEnabled,
  getPlayerJoined,
  net,
} = {}) {
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

        const { halfX, halfZ } = halfBoundsFor(p);
        const margin = headSize * 0.3;
        headPos.x = clamp(headPos.x + nx * penetration, -halfX + margin, halfX - margin);
        headPos.z = clamp(headPos.z + nz * penetration, -halfZ + margin, halfZ - margin);
        headPos.y = headSize / 2;
        if (p !== player) p.setLookDirFromMove(nx, nz);
        continue;
      }

      if (multiplayerEnabled) {
        if (p !== player) continue;
        const cubeId = Number(entry?.netId ?? cube.mesh.userData?.netCubeId) || 0;
        if (!cubeId) continue;
        if (!net?.requestCollectCube?.(cubeId)) continue;
        continue;
      }

      freeCubeSpawner.removeAt(i);
      p.enqueueTailValue(cubeValue);
      getStats(p).score += cubeValue;
    }
  }

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

  function update() {
    if (multiplayerEnabled) {
      if (getPlayerJoined?.()) resolvePlayerVsFreeCubes(player);
      return;
    }

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

            const { halfX, halfZ } = halfBoundsFor(eater);
            const margin = eaterSize * 0.3;
            if (penetration > 0) {
              eaterPos.x = clamp(eaterPos.x + nx * penetration, -halfX + margin, halfX - margin);
              eaterPos.z = clamp(eaterPos.z + nz * penetration, -halfZ + margin, halfZ - margin);
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
          const aPos2 = a.head.mesh.position;
          const bPos2 = b.head.mesh.position;
          const mx = (aPos2.x + bPos2.x) / 2;
          const mz = (aPos2.z + bPos2.z) / 2;
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
  }

  return { update };
}

