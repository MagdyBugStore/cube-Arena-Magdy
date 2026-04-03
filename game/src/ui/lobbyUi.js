export function createLobbyUi({
  multiplayerEnabled,
  netState,
  player,
  normalizeUserName,
  normalizeArenaType,
  loadUserName,
  saveUserName,
  setPaused,
  clearEndLeaderboard,
  netRequestRoomsList,
  netJoinExistingRoom,
  netCreateRoom,
  netStartRoom,
  netLeaveRoom,
  startGameSingleplayer,
  elements,
  currentArenaType,
} = {}) {
  const {
    startOverlay,
    startTitle,
    startHint,
    nameInput,
    stepName,
    stepRooms,
    stepLobby,
    continueBtn,
    roomsListEl,
    refreshRoomsBtn,
    toggleCreateRoomBtn,
    createRoomDetails,
    roomIdInput,
    maxPlayersInput,
    createRoomBtn,
    cancelCreateRoomBtn,
    lobbyInfoEl,
    lobbyPlayersEl,
    startMatchBtn,
    leaveRoomBtn,
    arenaButtons,
  } = elements ?? {};

  function getCurrentUserNameInput() {
    return normalizeUserName(nameInput?.value ?? "");
  }

  function setStartHintText(text) {
    if (startHint) startHint.textContent = String(text ?? "");
  }

  function setArenaButtonsActive(arenaType) {
    const current = normalizeArenaType(arenaType);
    for (const b of arenaButtons ?? []) {
      const t = normalizeArenaType(b?.dataset?.arena);
      b.classList.toggle("arenaBtnActive", t === current);
    }
  }

  let selectedArenaType = normalizeArenaType(currentArenaType);

  function getSelectedArenaType() {
    return selectedArenaType;
  }

  function setArenaSelection(next) {
    selectedArenaType = normalizeArenaType(next ?? selectedArenaType);
    setArenaButtonsActive(selectedArenaType);
  }

  function setStepVisible(step) {
    const s = String(step);
    if (stepName) stepName.style.display = s === "name" ? "flex" : "none";
    if (stepRooms) stepRooms.style.display = s === "rooms" ? "flex" : "none";
    if (stepLobby) stepLobby.style.display = s === "lobby" ? "flex" : "none";
  }

  function setCreateRoomDetailsVisible(visible) {
    if (!createRoomDetails) return;
    createRoomDetails.style.display = visible ? "flex" : "none";
  }

  function updateStartGateUI() {
    const ok = Boolean(getCurrentUserNameInput());
    if (continueBtn) continueBtn.disabled = !ok;
    if (toggleCreateRoomBtn) toggleCreateRoomBtn.disabled = !ok || !multiplayerEnabled;
    if (createRoomBtn) createRoomBtn.disabled = !ok || !multiplayerEnabled;
    return ok;
  }

  function renderRoomsList(rooms) {
    if (!roomsListEl) return;
    const list = Array.isArray(rooms) ? rooms : [];
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.8";
      empty.style.fontWeight = "800";
      empty.textContent = "لا توجد Rooms حالياً";
      roomsListEl.replaceChildren(empty);
      return;
    }

    roomsListEl.replaceChildren(
      ...list.map((r) => {
        const wrap = document.createElement("div");
        wrap.className = "roomItem";

        const meta = document.createElement("div");
        meta.className = "roomMeta";

        const idEl = document.createElement("div");
        idEl.className = "roomId";
        idEl.textContent = String(r?.roomId ?? "");

        const sub = document.createElement("div");
        sub.className = "roomSub";
        const arenaType = normalizeArenaType(r?.arenaType ?? "default");
        const count = Number(r?.playerCount) || 0;
        const max = Number(r?.maxPlayers) || 0;
        const status = String(r?.status ?? "waiting");
        sub.textContent = `الملعب: ${arenaType} — اللاعبين: ${count}/${max || "?"} — الحالة: ${status}`;

        meta.append(idEl, sub);

        const btn = document.createElement("button");
        btn.className = "secondaryBtn";
        btn.type = "button";
        btn.style.width = "140px";
        btn.textContent = "Join";

        const isStarted = status !== "waiting";
        const isFull = max > 0 && count >= max;
        btn.disabled = !multiplayerEnabled || !getCurrentUserNameInput() || isStarted || isFull;
        btn.addEventListener("click", () => {
          const roomId = String(r?.roomId ?? "");
          if (!roomId) return;
          clearEndLeaderboard?.();
          setPaused?.(true);
          setStepVisible("lobby");
          setCreateRoomDetailsVisible(false);
          setStartHintText("في انتظار بدء الـ Host");
          netJoinExistingRoom?.(roomId);
        });

        wrap.append(meta, btn);
        return wrap;
      }),
    );
  }

  function renderLobby(state) {
    if (!state?.roomId) return;
    clearEndLeaderboard?.();
    setPaused?.(true);
    setStepVisible("lobby");

    const roomId = String(state.roomId);
    const arenaType = normalizeArenaType(state?.arenaType ?? "default");
    const maxPlayers = Number(state?.maxPlayers) || 0;
    const status = String(state?.status ?? "waiting");
    const hostId = String(state?.hostId ?? "");
    const isHost = Boolean(netState?.playerId && hostId && netState.playerId === hostId);
    const playersList = Array.isArray(state?.players) ? state.players : [];

    if (lobbyInfoEl) {
      const count = playersList.length;
      lobbyInfoEl.textContent = `Room: ${roomId} — الملعب: ${arenaType} — اللاعبين: ${count}/${maxPlayers || "?"} — ${isHost ? "Host" : "Guest"} — ${status}`;
    }

    if (lobbyPlayersEl) {
      lobbyPlayersEl.replaceChildren(
        ...playersList.map((p) => {
          const row = document.createElement("div");
          row.className = "playerItem";
          const name = document.createElement("div");
          name.textContent = String(p?.name ?? "Player");
          const right = document.createElement("div");
          const mark = String(p?.id ?? "") === hostId ? "Host" : "";
          right.style.opacity = "0.8";
          right.textContent = mark;
          row.append(name, right);
          return row;
        }),
      );
    }

    const canStart = isHost && status === "waiting" && playersList.length >= 2;
    if (startMatchBtn) startMatchBtn.disabled = !canStart;
    setStartHintText(canStart ? "تقدر تبدأ اللعب" : "في انتظار لاعب آخر أو بدء الـ Host");
  }

  function showStartOverlay() {
    if (startOverlay) startOverlay.style.display = "grid";
  }

  function hideStartOverlay() {
    if (startOverlay) startOverlay.style.display = "none";
  }

  function showStartOverlayDefault() {
    if (startTitle) startTitle.textContent = "ابدأ المباراة";
    setPaused?.(true);
    const hasName = Boolean(loadUserName?.());
    setStepVisible(hasName ? "rooms" : "name");
    setStartHintText(hasName ? "اختار Room أو اعمل واحدة جديدة" : "ادخل User name ثم اختار أو أنشئ Room");
    updateStartGateUI();
    setArenaSelection(currentArenaType);
    clearEndLeaderboard?.();
    if (hasName && multiplayerEnabled) netRequestRoomsList?.();
  }

  function bind() {
    if (nameInput) {
      nameInput.value = loadUserName?.() ?? "";
      updateStartGateUI();
      setArenaSelection(currentArenaType);
      nameInput.addEventListener("input", () => updateStartGateUI(), { passive: true });
      nameInput.addEventListener(
        "keydown",
        (e) => {
          if (e.code === "Space") e.stopPropagation();
          if (e.code === "Enter") e.stopPropagation();
        },
        { passive: false },
      );
    }

    for (const b of arenaButtons ?? []) {
      b.addEventListener("click", () => {
        const t = b?.dataset?.arena;
        setArenaSelection(t);
        if (!multiplayerEnabled) startGameSingleplayer?.(t);
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener("click", () => {
        const inputName = getCurrentUserNameInput();
        if (!inputName) {
          setStartHintText("لازم تدخل User name الأول");
          if (nameInput?.focus) nameInput.focus();
          updateStartGateUI();
          return;
        }
        const nextName = saveUserName?.(inputName) ?? inputName;
        player?.setName?.(nextName);
        clearEndLeaderboard?.();
        if (multiplayerEnabled) {
          setStepVisible("rooms");
          setCreateRoomDetailsVisible(false);
          setStartHintText("اختار Room أو اعمل واحدة جديدة");
          netRequestRoomsList?.();
        } else {
          setStepVisible("rooms");
          setCreateRoomDetailsVisible(true);
          setStartHintText("اختار الملعب");
        }
      });
    }

    if (refreshRoomsBtn) refreshRoomsBtn.addEventListener("click", () => netRequestRoomsList?.());

    if (toggleCreateRoomBtn) {
      toggleCreateRoomBtn.addEventListener("click", () => {
        setCreateRoomDetailsVisible(true);
        if (roomIdInput?.focus) roomIdInput.focus();
      });
    }

    if (cancelCreateRoomBtn) cancelCreateRoomBtn.addEventListener("click", () => setCreateRoomDetailsVisible(false));

    if (createRoomBtn) {
      createRoomBtn.addEventListener("click", () => {
        const inputName = getCurrentUserNameInput();
        if (!inputName) {
          setStartHintText("لازم تدخل User name الأول");
          if (nameInput?.focus) nameInput.focus();
          updateStartGateUI();
          return;
        }
        const nextName = saveUserName?.(inputName) ?? inputName;
        player?.setName?.(nextName);

        const rawRoomId = String(roomIdInput?.value ?? "").trim();
        const nextRoomId = rawRoomId || `room_${Math.random().toString(36).slice(2, 8)}`;
        const maxPlayers = Math.max(2, Math.min(20, Number(maxPlayersInput?.value) || 8));
        clearEndLeaderboard?.();
        setPaused?.(true);
        setStepVisible("lobby");
        setCreateRoomDetailsVisible(false);
        setStartHintText("في انتظار بدء الـ Host");
        netCreateRoom?.({ roomId: nextRoomId, arenaType: selectedArenaType, maxPlayers });
      });
    }

    if (startMatchBtn) {
      startMatchBtn.addEventListener("click", () => {
        if (startMatchBtn.disabled) return;
        netStartRoom?.();
      });
    }

    if (leaveRoomBtn) {
      leaveRoomBtn.addEventListener("click", () => {
        netLeaveRoom?.();
        setPaused?.(true);
        setStepVisible("rooms");
        setCreateRoomDetailsVisible(false);
        setStartHintText("اختار Room أو اعمل واحدة جديدة");
        netRequestRoomsList?.();
      });
    }
  }

  return {
    bind,
    getCurrentUserNameInput,
    setStartHintText,
    getSelectedArenaType,
    setArenaSelection,
    setStepVisible,
    setCreateRoomDetailsVisible,
    updateStartGateUI,
    renderRoomsList,
    renderLobby,
    showStartOverlay,
    hideStartOverlay,
    showStartOverlayDefault,
  };
}

