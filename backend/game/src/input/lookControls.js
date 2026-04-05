export function createLookControls({ THREE, env, player, getPlayerJoined, halfBoundsFor, clamp, pressed } = {}) {
  const clickNdc = new THREE.Vector2();
  const clickRaycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const clickPoint = new THREE.Vector3();

  let pointerLookActive = false;
  let pointerLookId = -1;

  function updateLookFromClientXY(clientX, clientY) {
    if (!getPlayerJoined?.()) return;
    const dom = env?.renderer?.domElement;
    if (!dom) return;
    const rect = dom.getBoundingClientRect();
    clickNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    clickNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    clickRaycaster.setFromCamera(clickNdc, env.camera);
    const hit = clickRaycaster.ray.intersectPlane(groundPlane, clickPoint);
    if (!hit) return;

    const { halfX, halfZ } = halfBoundsFor(player);
    const margin = (player?.head?.size ?? 0) * 0.3;
    const x = clamp(clickPoint.x, -halfX + margin, halfX - margin);
    const z = clamp(clickPoint.z, -halfZ + margin, halfZ - margin);

    const dx = x - player.head.mesh.position.x;
    const dz = z - player.head.mesh.position.z;
    player.setLookDirFromMove(dx, dz);
  }

  function bind() {
    const dom = env?.renderer?.domElement;
    if (!dom) return;

    dom.addEventListener(
      "pointerdown",
      (e) => {
        if (!getPlayerJoined?.()) return;
        if (!e.isPrimary) return;
        if (e.pointerType !== "mouse") {
          pointerLookActive = true;
          pointerLookId = e.pointerId;
          dom.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
        updateLookFromClientXY(e.clientX, e.clientY);
      },
      { passive: false },
    );

    dom.addEventListener(
      "pointermove",
      (e) => {
        if (!getPlayerJoined?.()) return;

        if (e.pointerType !== "mouse") {
          if (!pointerLookActive || e.pointerId !== pointerLookId) return;
          e.preventDefault();
          updateLookFromClientXY(e.clientX, e.clientY);
          return;
        }

        const lookingWithKeys =
          pressed?.has?.("ArrowRight") ||
          pressed?.has?.("KeyD") ||
          pressed?.has?.("ArrowLeft") ||
          pressed?.has?.("KeyA") ||
          pressed?.has?.("ArrowDown") ||
          pressed?.has?.("KeyS") ||
          pressed?.has?.("ArrowUp") ||
          pressed?.has?.("KeyW");
        if (lookingWithKeys) return;

        updateLookFromClientXY(e.clientX, e.clientY);
      },
      { passive: false },
    );

    dom.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pointerLookId) return;
      pointerLookActive = false;
      pointerLookId = -1;
    });
    dom.addEventListener("pointercancel", (e) => {
      if (e.pointerId !== pointerLookId) return;
      pointerLookActive = false;
      pointerLookId = -1;
    });
  }

  return { bind, updateLookFromClientXY };
}

