export function createCameraSystem({
  env,
  player,
  bots,
  clamp,
  setShadowCenter,
  cameraFollowOffset,
  defaultCameraPos,
  testMode,
} = {}) {
  const state = {
    testCamMode: testMode ? "bot" : "off",
    testCamFocus: 0,
  };

  function bindTestControls() {
    if (!testMode) return;
    globalThis.addEventListener("keydown", (e) => {
      if (e.code === "Digit1") {
        state.testCamMode = "bot";
        state.testCamFocus = 0;
      }
      if (e.code === "Digit0") state.testCamMode = "off";
    });
  }

  function updateTestCamera() {
    if (!testMode) return false;
    if (!Array.isArray(bots) || bots.length === 0) return false;
    if (state.testCamMode === "off") return false;

    const idx = clamp(state.testCamFocus | 0, 0, bots.length - 1);
    const focus = bots[idx];
    if (!focus?.head?.mesh) return false;
    env.camera.position.copy(focus.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(focus.head.mesh.position.x, 0, focus.head.mesh.position.z);
    setShadowCenter(focus.head.mesh.position.x, focus.head.mesh.position.z);
    return true;
  }

  function updateFollowCamera({ playerJoined, spectatorFocus }) {
    const focus = playerJoined ? player : spectatorFocus;
    if (!focus?.head?.mesh) return;
    env.camera.position.copy(focus.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(focus.head.mesh.position.x, 0, focus.head.mesh.position.z);
    setShadowCenter(focus.head.mesh.position.x, focus.head.mesh.position.z);
  }

  function resetCameraToDefault() {
    env.camera.position.copy(defaultCameraPos);
    env.camera.lookAt(0, 0, 0);
    setShadowCenter(0, 0);
  }

  return { bindTestControls, updateTestCamera, updateFollowCamera, resetCameraToDefault };
}

