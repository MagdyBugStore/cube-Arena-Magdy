export function createTailSystem({ freeCubeSpawner, multiplayerEnabled } = {}) {
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

  function dropSegmentAsFreeCube(seg) {
    if (multiplayerEnabled) return;
    if (!seg?.mesh) return;
    const v = seg.value ?? 0;
    if (!(v > 0)) return;
    if (typeof freeCubeSpawner?.spawnAt !== "function") return;
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

  return { removeTailAt, dropTailFromIndex, dropSegmentAsFreeCube };
}

