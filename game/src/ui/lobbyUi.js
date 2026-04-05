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
  function el(tag, { className, text, type, dir, placeholder, value, min, max, disabled } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    if (type) node.type = type;
    if (dir) node.dir = dir;
    if (placeholder !== undefined) node.placeholder = String(placeholder);
    if (value !== undefined) node.value = String(value);
    if (min !== undefined) node.min = String(min);
    if (max !== undefined) node.max = String(max);
    if (disabled !== undefined) node.disabled = Boolean(disabled);
    return node;
  }

  function ensureElements(existing) {
    if (existing?.startOverlay) {
      if (existing.startOverlay.dataset.ui !== "ref") {
        existing.startOverlay.dataset.ui = "ref";
        try {
          existing.startOverlay.style.background =
            "radial-gradient(circle at top right, rgba(26, 26, 46, 1) 0%, rgba(10, 18, 32, 1) 55%, rgba(10, 18, 32, 1) 100%)";
        } catch {
        }

        const startCard = existing.startOverlay.querySelector?.("#startCard");
        if (startCard) {
          startCard.style.width = "min(820px, calc(100vw - 32px))";
          startCard.style.maxHeight = "min(86vh, 820px)";
          startCard.style.overflow = "auto";
          startCard.style.background = "rgba(25, 25, 31, 0.62)";
          startCard.style.backdropFilter = "blur(18px)";
          startCard.style.border = "1px solid rgba(0, 245, 255, 0.14)";
        }

        if (existing.startTitle) {
          existing.startTitle.style.textAlign = "center";
        }
        if (existing.startHint) {
          existing.startHint.style.textAlign = "center";
        }

        if (existing.stepRooms && !existing.roomsSearchInput) {
          const found = existing.stepRooms.querySelector?.('input[placeholder*="Search"]');
          if (found) {
            existing.roomsSearchInput = found;
          } else {
          const wrap = el("div", { className: "roomsSearchWrap" });
          wrap.style.display = "flex";
          wrap.style.alignItems = "center";
          wrap.style.gap = "10px";
          wrap.style.padding = "10px 12px";
          wrap.style.borderRadius = "14px";
          wrap.style.border = "1px solid rgba(255, 255, 255, 0.12)";
          wrap.style.background = "rgba(255, 255, 255, 0.04)";

          const input = el("input", {
            className: "textInput",
            type: "text",
            dir: "ltr",
            placeholder: "Search ID...",
            value: "",
          });
          input.style.width = "100%";
          wrap.append(input);

          const roomsList = existing.roomsListEl;
          if (roomsList?.parentNode === existing.stepRooms) {
            existing.stepRooms.insertBefore(wrap, roomsList);
          } else {
            existing.stepRooms.append(wrap);
          }
          existing.roomsSearchInput = input;
          }
        }
      }

      return existing;
    }

    const startOverlay = el("div", { className: "startOverlay", dir: "rtl" });
    startOverlay.dataset.ui = "ref";
    startOverlay.style.position = "fixed";
    startOverlay.style.inset = "0";
    startOverlay.style.zIndex = "50";
    startOverlay.style.display = "grid";
    startOverlay.style.placeItems = "center";
    startOverlay.style.background = "radial-gradient(circle at top right, rgba(26, 26, 46, 1) 0%, rgba(10, 18, 32, 1) 55%, rgba(10, 18, 32, 1) 100%)";

    const startCard = el("div", { className: "startCard" });
    startCard.style.width = "min(820px, calc(100vw - 32px))";
    startCard.style.maxHeight = "min(86vh, 820px)";
    startCard.style.overflow = "auto";
    startCard.style.padding = "18px";
    startCard.style.borderRadius = "16px";
    startCard.style.background = "rgba(25, 25, 31, 0.62)";
    startCard.style.backdropFilter = "blur(18px)";
    startCard.style.border = "1px solid rgba(0, 245, 255, 0.14)";
    startCard.style.color = "rgba(255, 255, 255, 0.92)";
    startCard.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

    const startTitle = el("h2", { className: "startTitle", text: "ابدأ المباراة" });
    startTitle.style.fontWeight = "900";
    startTitle.style.letterSpacing = "0.2px";
    startTitle.style.margin = "0 0 10px";
    startTitle.style.textAlign = "center";

    const startHint = el("p", { className: "startHint", text: "ادخل User name ثم اختار أو أنشئ Room" });
    startHint.style.opacity = "0.85";
    startHint.style.margin = "0 0 14px";
    startHint.style.fontWeight = "700";
    startHint.style.textAlign = "center";

    const stepName = el("div", { className: "section" });
    stepName.style.display = "flex";
    stepName.style.flexDirection = "column";
    stepName.style.gap = "10px";

    const nameRow = el("div", { className: "nameRow" });
    nameRow.style.display = "flex";
    nameRow.style.flexDirection = "column";
    nameRow.style.gap = "8px";

    const nameLabel = el("div", { className: "fieldLabel", text: "User name" });
    nameLabel.style.fontWeight = "850";
    nameLabel.style.opacity = "0.92";
    nameLabel.style.letterSpacing = "0.2px";
    nameLabel.style.textAlign = "right";

    const nameInput = el("input", {
      className: "textInput",
      type: "text",
      dir: "auto",
      placeholder: "اكتب اسمك",
      value: "",
    });
    nameInput.autocomplete = "nickname";
    nameInput.maxLength = 18;

    const continueBtn = el("button", { className: "primaryBtn", type: "button", text: "متابعة" });

    nameRow.append(nameLabel, nameInput);
    stepName.append(nameRow, continueBtn);

    const stepRooms = el("div", { className: "section" });
    stepRooms.style.display = "none";
    stepRooms.style.flexDirection = "column";
    stepRooms.style.gap = "10px";

    const roomsLabel = el("div", { className: "fieldLabel", text: "Rooms المتاحة" });
    roomsLabel.style.fontWeight = "850";
    roomsLabel.style.opacity = "0.92";
    roomsLabel.style.letterSpacing = "0.2px";
    roomsLabel.style.textAlign = "right";

    const roomsSearchWrap = el("div", { className: "roomsSearchWrap" });
    roomsSearchWrap.style.display = "flex";
    roomsSearchWrap.style.alignItems = "center";
    roomsSearchWrap.style.gap = "10px";
    roomsSearchWrap.style.padding = "10px 12px";
    roomsSearchWrap.style.borderRadius = "14px";
    roomsSearchWrap.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    roomsSearchWrap.style.background = "rgba(255, 255, 255, 0.04)";

    const roomsSearchInput = el("input", {
      className: "textInput",
      type: "text",
      dir: "ltr",
      placeholder: "Search ID...",
      value: "",
    });
    roomsSearchInput.style.width = "100%";

    const roomsListEl = el("div", { className: "roomsList" });

    const refreshRoomsBtn = el("button", { className: "secondaryBtn", type: "button", text: "تحديث" });
    const toggleCreateRoomBtn = el("button", { className: "primaryBtn", type: "button", text: "إنشاء Room جديدة" });

    const createRoomDetails = el("div", { className: "section" });
    createRoomDetails.style.display = "none";
    createRoomDetails.style.flexDirection = "column";
    createRoomDetails.style.gap = "10px";

    const createLabel = el("div", { className: "fieldLabel", text: "تفاصيل إنشاء الـ Room" });
    createLabel.style.fontWeight = "850";
    createLabel.style.opacity = "0.92";
    createLabel.style.letterSpacing = "0.2px";
    createLabel.style.textAlign = "right";

    const roomIdInput = el("input", {
      className: "textInput",
      type: "text",
      dir: "ltr",
      placeholder: "room-id (مثال: magdy1)",
      value: "",
    });
    roomIdInput.maxLength = 24;

    const arenaRow = el("div", { className: "arenaRow" });
    arenaRow.style.display = "grid";
    arenaRow.style.gridTemplateColumns = "1fr 1fr";
    arenaRow.style.gap = "10px";
    arenaRow.style.margin = "0 0 6px";

    const arenaButtons = ["default", "football", "tennis", "interlock", "geo"].map((t) => {
      const btn = el("button", { className: "arenaBtn", type: "button", text: t });
      btn.dataset.arena = t;
      return btn;
    });
    arenaRow.append(...arenaButtons);

    const maxPlayersInput = el("input", { className: "textInput", type: "number", min: 2, max: 20, value: 8 });
    const createRoomBtn = el("button", { className: "primaryBtn", type: "button", text: "Create Room" });
    const cancelCreateRoomBtn = el("button", { className: "secondaryBtn", type: "button", text: "إلغاء" });

    roomsSearchWrap.append(roomsSearchInput);
    createRoomDetails.append(createLabel, roomIdInput, arenaRow, maxPlayersInput, createRoomBtn, cancelCreateRoomBtn);
    stepRooms.append(roomsLabel, roomsSearchWrap, roomsListEl, refreshRoomsBtn, toggleCreateRoomBtn, createRoomDetails);

    const stepLobby = el("div", { className: "section" });
    stepLobby.style.display = "none";
    stepLobby.style.flexDirection = "column";
    stepLobby.style.gap = "10px";

    const lobbyInfoEl = el("div", { className: "fieldLabel", text: "" });
    const lobbyPlayersEl = el("div", { className: "lobbyPlayers" });
    const startMatchBtn = el("button", { className: "primaryBtn", type: "button", text: "ابدأ اللعب", disabled: true });
    const leaveRoomBtn = el("button", { className: "secondaryBtn", type: "button", text: "خروج من الـ Room" });

    stepLobby.append(lobbyInfoEl, lobbyPlayersEl, startMatchBtn, leaveRoomBtn);

    const endLeaderboardEl = el("div", { className: "endLeaderboard" });

    startCard.append(startTitle, startHint, stepName, stepRooms, stepLobby, endLeaderboardEl);
    startOverlay.append(startCard);
    document.body.append(startOverlay);

    return {
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
      roomsSearchInput,
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
      endLeaderboardEl,
    };
  }

  const ui = ensureElements(elements);
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
    roomsSearchInput,
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
  } = ui ?? {};

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
    if (stepName) stepName.style.display = s === "name" ? "" : "none";
    if (stepRooms) stepRooms.style.display = s === "rooms" ? "" : "none";
    if (stepLobby) stepLobby.style.display = s === "lobby" ? "" : "none";
  }

  function setCreateRoomDetailsVisible(visible) {
    if (!createRoomDetails) return;
    createRoomDetails.style.display = visible ? "" : "none";
  }

  function updateStartGateUI() {
    const ok = Boolean(getCurrentUserNameInput());
    if (continueBtn) continueBtn.disabled = !ok;
    if (toggleCreateRoomBtn) toggleCreateRoomBtn.disabled = !ok || !multiplayerEnabled;
    if (createRoomBtn) createRoomBtn.disabled = !ok || !multiplayerEnabled;
    return ok;
  }

  let lastRooms = [];
  let roomsFilter = "";

  function setRoomsFilter(next) {
    roomsFilter = String(next ?? "").trim().toLowerCase();
    renderRoomsList(lastRooms);
  }

  function renderRoomsList(rooms) {
    if (!roomsListEl) return;
    const listRaw = Array.isArray(rooms) ? rooms : [];
    lastRooms = listRaw;
    const list = roomsFilter
      ? listRaw.filter((r) => String(r?.roomId ?? "").toLowerCase().includes(roomsFilter))
      : listRaw;
    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.style.opacity = "0.8";
      empty.style.fontWeight = "800";
      empty.textContent = roomsFilter ? "لا توجد Rooms مطابقة" : "لا توجد Rooms حالياً";
      roomsListEl.replaceChildren(empty);
      return;
    }

    roomsListEl.replaceChildren(
      ...list.map((r) => {
        const roomId = String(r?.roomId ?? "");
        const arenaType = normalizeArenaType(r?.arenaType ?? "default");
        const count = Number(r?.playerCount) || 0;
        const max = Number(r?.maxPlayers) || 0;
        const status = String(r?.status ?? "waiting");

        const accent =
          arenaType === "football" ? "secondary" : arenaType === "tennis" ? "tertiary" : arenaType === "geo" ? "error" : "primary";

        const wrap = document.createElement("div");
        wrap.className =
          "group relative overflow-hidden bg-surface-container-low/40 border border-outline-variant/10 p-5 rounded-xl hover:bg-surface-container-high transition-all flex items-center justify-between";

        const left = document.createElement("div");
        left.className = "flex items-center gap-6 min-w-0";

        const thumb = document.createElement("div");
        thumb.className = `w-16 h-16 rounded-lg bg-surface-container-highest overflow-hidden relative border border-${accent}/20 flex-shrink-0`;
        const badge = document.createElement("div");
        badge.className = "absolute inset-0 flex items-center justify-center";
        const badgeText = document.createElement("span");
        badgeText.className = `text-[10px] font-label text-${accent} font-bold`;
        badgeText.textContent = arenaType.toUpperCase();
        badge.append(badgeText);
        thumb.append(badge);

        const meta = document.createElement("div");
        meta.className = "min-w-0";
        const title = document.createElement("h3");
        title.className = `font-headline font-bold text-lg text-on-surface group-hover:text-${accent} transition-colors truncate`;
        title.textContent = roomId;

        const subRow = document.createElement("div");
        subRow.className = "flex gap-4 mt-1";
        const mapTag = document.createElement("div");
        mapTag.className = "flex items-center gap-1.5 text-on-surface-variant text-xs";
        mapTag.innerHTML = `<span class="material-symbols-outlined text-sm">map</span>${arenaType}`;
        const stateTag = document.createElement("div");
        stateTag.className = `flex items-center gap-1.5 text-${accent} text-xs font-bold`;
        stateTag.innerHTML = `<span class="material-symbols-outlined text-sm">bolt</span>${status.toUpperCase()}`;
        subRow.append(mapTag, stateTag);

        meta.append(title, subRow);
        left.append(thumb, meta);

        const right = document.createElement("div");
        right.className = "flex items-center gap-10 flex-shrink-0";
        const countWrap = document.createElement("div");
        countWrap.className = "text-right";
        countWrap.innerHTML = `
          <div class="flex items-center justify-end gap-1 mb-1">
            <span class="material-symbols-outlined text-on-surface-variant text-sm">group</span>
            <span class="font-headline font-black text-on-surface">${count}/${max || "?"}</span>
          </div>
          <p class="text-[10px] font-label text-on-surface-variant tracking-wider uppercase">Players</p>
        `;

        const btn = document.createElement("button");
        btn.className = `px-6 py-2.5 rounded bg-surface-container-highest border border-outline-variant/30 font-headline font-bold text-sm tracking-widest hover:border-${accent} hover:text-${accent} transition-all`;
        btn.type = "button";
        btn.textContent = "JOIN";

        const isStarted = status !== "waiting";
        const isFull = max > 0 && count >= max;
        btn.disabled = !multiplayerEnabled || !getCurrentUserNameInput() || isStarted || isFull;
        btn.addEventListener("click", () => {
          if (!roomId) return;
          clearEndLeaderboard?.();
          setPaused?.(true);
          setStepVisible("lobby");
          setCreateRoomDetailsVisible(false);
          setStartHintText("في انتظار بدء الـ Host");
          netJoinExistingRoom?.(roomId);
        });

        right.append(countWrap, btn);
        wrap.append(left, right);
        return wrap;
      }),
    );
  }

  function renderLobby(state) {
    if (!state?.roomId) return;
    clearEndLeaderboard?.();

    const roomId = String(state.roomId);
    const arenaType = normalizeArenaType(state?.arenaType ?? "default");
    const maxPlayers = Number(state?.maxPlayers) || 0;
    const status = String(state?.status ?? "waiting");
    const hostId = String(state?.hostId ?? "");
    const isHost = Boolean(netState?.playerId && hostId && netState.playerId === hostId);
    const playersList = Array.isArray(state?.players) ? state.players : [];

    if (status !== "started") {
      setPaused?.(true);
      setStepVisible("lobby");
    }

    if (lobbyInfoEl) {
      const count = playersList.length;
      lobbyInfoEl.textContent = `Room: ${roomId} — الملعب: ${arenaType} — اللاعبين: ${count}/${maxPlayers || "?"} — ${isHost ? "Host" : "Guest"} — ${status}`;
    }

    if (lobbyPlayersEl) {
      lobbyPlayersEl.replaceChildren(
        ...playersList.map((p) => {
          const row = document.createElement("div");
          row.className = "flex items-center justify-between gap-4 bg-surface-container-low/40 border border-outline-variant/10 rounded-xl px-4 py-3";
          const name = document.createElement("div");
          name.className = "font-headline font-bold text-on-surface truncate";
          name.textContent = String(p?.name ?? "Player");
          const right = document.createElement("div");
          right.className = "text-xs font-label text-on-surface-variant tracking-widest uppercase";
          right.textContent = String(p?.id ?? "") === hostId ? "HOST" : "";
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
    if (startOverlay) startOverlay.style.display = "";
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

    if (roomsSearchInput && !roomsSearchInput.dataset.hooked) {
      roomsSearchInput.dataset.hooked = "1";
      roomsSearchInput.addEventListener("input", (e) => setRoomsFilter(e?.target?.value ?? ""), { passive: true });
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
