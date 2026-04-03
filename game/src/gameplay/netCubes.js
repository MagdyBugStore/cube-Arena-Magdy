export function createNetCubesManager({ freeCubeSpawner }) {
  const netCubes = new Map();

  function clearAllFreeCubes() {
    if (!freeCubeSpawner?.cubes || typeof freeCubeSpawner.removeAt !== "function") return;
    for (let i = freeCubeSpawner.cubes.length - 1; i >= 0; i -= 1) freeCubeSpawner.removeAt(i);
  }

  function clearNetCubes() {
    netCubes.clear();
    clearAllFreeCubes();
  }

  function spawnNetCube(c) {
    const cubeId = Number(c?.id ?? c?.cubeId) || 0;
    if (!cubeId) return;
    if (netCubes.has(cubeId)) return;
    const value = Math.max(1, Number(c?.value) || 1);
    const x = Number(c?.x) || 0;
    const z = Number(c?.z) || 0;
    const entry = typeof freeCubeSpawner?.spawnNet === "function" ? freeCubeSpawner.spawnNet({ id: cubeId, value, x, z }) : null;
    if (!entry) return;
    netCubes.set(cubeId, entry);
  }

  function removeNetCube(cubeId) {
    const id = Number(cubeId) || 0;
    if (!id) return;
    if (typeof freeCubeSpawner?.removeByNetId === "function") freeCubeSpawner.removeByNetId(id);
    netCubes.delete(id);
  }

  return { netCubes, clearNetCubes, spawnNetCube, removeNetCube };
}

