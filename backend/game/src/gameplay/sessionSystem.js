export function createSessionSystem({
  env,
  player,
  players,
  pressed,
  lobbyUi,
  nameInput,
  setPaused,
  saveUserName,
  applyArenaType,
  getCurrentArenaType,
  setArenaSelection,
  respawnPlayer,
  respawnPlayerAt,
  dropTailFromIndex,
  clearTailAndHide,
  defaultCameraPos,
  defaultCameraFollowOffset,
  cameraFollowOffset,
  setShadowCenter,
  getPlayerJoined,
  setPlayerJoined,
  getSpectatorFocus,
  setSpectatorFocus,
  resetMatchWorld,
  multiplayerEnabled,
} = {}) {
  function joinArena(spawn) {
    if (getPlayerJoined()) return;
    setSpectatorFocus(null);
    if (multiplayerEnabled && spawn) respawnPlayerAt(player, spawn);
    else respawnPlayer(player, { avoid: players });
    if (player.head?.mesh) player.head.mesh.visible = true;
    player.eliminated = false;
    players.unshift(player);
    env.addUpdatable(player);
    cameraFollowOffset.copy(defaultCameraFollowOffset);
    env.camera.position.copy(player.head.mesh.position).add(cameraFollowOffset);
    env.camera.lookAt(player.head.mesh.position.x, 0, player.head.mesh.position.z);
    setPlayerJoined(true);
  }

  function leaveArena(focus) {
    if (!getPlayerJoined()) return;
    setPlayerJoined(false);
    setSpectatorFocus(focus ?? null);
    const idx = players.indexOf(player);
    if (idx >= 0) players.splice(idx, 1);
    if (env.updatables?.delete) env.updatables.delete(player);
    dropTailFromIndex(player, 0);
    clearTailAndHide();
    pressed.clear();
    const f = getSpectatorFocus();
    if (f?.head?.mesh) {
      env.camera.position.copy(f.head.mesh.position).add(cameraFollowOffset);
      env.camera.lookAt(f.head.mesh.position.x, 0, f.head.mesh.position.z);
      setShadowCenter(f.head.mesh.position.x, f.head.mesh.position.z);
    } else {
      env.camera.position.copy(defaultCameraPos);
      env.camera.lookAt(0, 0, 0);
      setShadowCenter(0, 0);
    }
    lobbyUi.showStartOverlay();
  }

  function startGame(nextArenaType) {
    const inputName = lobbyUi.getCurrentUserNameInput();
    if (!inputName) {
      lobbyUi.setStartHintText("لازم تدخل User name الأول");
      if (nameInput?.focus) nameInput.focus();
      lobbyUi.updateStartGateUI();
      return;
    }
    const nextName = saveUserName(inputName);
    player.setName(nextName);
    applyArenaType(nextArenaType ?? getCurrentArenaType());
    setArenaSelection(getCurrentArenaType());
    setPaused(false);
    lobbyUi.showStartOverlayDefault();
    lobbyUi.hideStartOverlay();
    resetMatchWorld();
    joinArena();
  }

  return { joinArena, leaveArena, startGame };
}

