export function createSpawnSystem({
  mapSize,
  getCurrentMovementBounds,
  randomBetween,
  clamp,
  getStats,
} = {}) {
  function chooseSpawnXZ({ bounds, radius, avoid = [], avoidDist = 5.5, tries = 60 } = {}) {
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
    const bounds = p?.movementBounds ?? getCurrentMovementBounds?.();
    const { x, z } = chooseSpawnXZ({
      bounds,
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
    const s = getStats?.(p);
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
    const s = getStats?.(p);
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

  return { chooseSpawnXZ, placePlayer, respawnPlayer, respawnPlayerAt, spawnInFrontOfPlayer };
}

