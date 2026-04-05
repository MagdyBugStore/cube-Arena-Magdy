import geckos from "@geckos.io/client";

export function createNetSystem({
  multiplayerEnabled,
  protoAvailable,
  urlParams,
  netLogEnabled,
  netCaseEnabled,
  netCaseIntervalMs,
  THREE,
  env,
  player,
  players,
  Player,
  cubeFactory,
  mapSize,
  getCurrentMovementBounds,
  baseSpeedAt2,
  getPlayerJoined,
  getMatchActive,
  setFreeCubeSpawnerEnabled,
  spawnNetCube,
  removeNetCube,
  clearNetCubes,
  netCollectLastAtMs,
  getPlayerName,
  getStats,
} = {}) {
  const netState = {
    channel: null,
    connected: false,
    roomId: null,
    playerId: null,
    playerNum: null,
    joined: false,
    pending: null,
    lastSentAtMs: 0,
    seq: 0,
    remotes: new Map(),
    remotesByNum: new Map(),
    proto: null,
    rooms: [],
    lobby: null,
  };

  const traffic = {
    tx: 0,
    rx: 0,
    lastRateLogAtMs: 0,
    lastSkipLogAtMs: 0,
  };

  const debugPlayerUpdate = {
    lastTxLogAtMs: 0,
    lastRxLogAtMsByPid: new Map(),
  };

  const debugClient = {
    lastSampleSentAtMs: 0,
    lastTx: null,
    lastTxBytes: 0,
  };

  function maybeEmitUpdateSample({ channel, nowMs, reason, hasProto } = {}) {
    
    if (!channel) return;
    const elapsedSample = nowMs - (debugClient.lastSampleSentAtMs || 0);
    if (elapsedSample < 3000) return;
    debugClient.lastSampleSentAtMs = nowMs;

    const usingRaw = typeof channel?.raw?.emit === "function";
    const payload = {
      roomId: netState.roomId,
      playerNum: netState.playerNum,
      reason: String(reason ?? ""),
      joined: netState.joined,
      playing: Boolean(getPlayerJoined?.()),
      connected: netState.connected,
      hasChannel: Boolean(channel),
      hasProto: Boolean(hasProto),
      usingRaw,
      bytes: debugClient.lastTxBytes || 0,
    };

    if (debugClient.lastTx) Object.assign(payload, debugClient.lastTx);

    try {
      console.log("client:update-sample", payload);
      channel.emit("client:update-sample", payload);
    } catch {
    }
    netLog("client:update-sample", payload);
  }

  const handlers = {
    onRoomsList: null,
    onLobbyState: null,
    onRoomStarted: null,
    onRoomError: null,
  };

  const lastPayloads = {
    roomsList: null,
    roomState: null,
    roomStarted: null,
  };

  function replayLastPayloads() {
    if (handlers.onRoomsList && lastPayloads.roomsList)
      handlers.onRoomsList(lastPayloads.roomsList);
    if (handlers.onLobbyState && lastPayloads.roomState)
      handlers.onLobbyState(lastPayloads.roomState);
    if (handlers.onRoomStarted && lastPayloads.roomStarted)
      handlers.onRoomStarted(lastPayloads.roomStarted);
  }

  function setHandlers(next) {
    handlers.onRoomsList =
      typeof next?.onRoomsList === "function"
        ? next.onRoomsList
        : handlers.onRoomsList;
    handlers.onLobbyState =
      typeof next?.onLobbyState === "function"
        ? next.onLobbyState
        : handlers.onLobbyState;
    handlers.onRoomStarted =
      typeof next?.onRoomStarted === "function"
        ? next.onRoomStarted
        : handlers.onRoomStarted;
    handlers.onRoomError =
      typeof next?.onRoomError === "function"
        ? next.onRoomError
        : handlers.onRoomError;
    replayLastPayloads();
  }

  function netLog(event, data) {
    if (!netLogEnabled) return;
    const t = (performance.now() / 1000).toFixed(3);
    const labelName = (() => {
      try {
        return getPlayerName(player);
      } catch {
        return "Player";
      }
    })();
    const labelId = String(netState.playerId ?? netState.channel?.id ?? "");
    const label = labelId ? `${labelName}@${labelId}` : labelName;
    const state = {
      pid: netState.playerId,
      pnum: netState.playerNum,
      room: netState.roomId,
      joined: netState.joined,
      connected: netState.connected,
      remotes: netState.remotes.size,
      playing: Boolean(getPlayerJoined?.()),
    };
    if (data === undefined) console.log(`[net ${t}] ${label} ${event}`, state);
    else console.log(`[net ${t}] ${label} ${event}`, state, data);
  }

  function reportHandlerError(handlerName, error) {
    console.error(`[net] handler error (${handlerName})`, error);
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    netLog(`handler:error:${handlerName}`, { message });
  }

  if (netCaseEnabled) {
    setInterval(
      () => {
        const nowMs = performance.now();
        const lobby = netState.lobby;
        const lobbyPlayers = Array.isArray(lobby?.players) ? lobby.players : [];
        const remotes = Array.from(netState.remotes.entries()).map(
          ([id, entry]) => ({
            id,
            name: getPlayerName(entry?.player),
            lastSeenSec: entry?.lastSeenAtMs
              ? Number(((nowMs - entry.lastSeenAtMs) / 1000).toFixed(2))
              : null,
          }),
        );
        netLog("case", {
          urlRoom: String(
            urlParams?.get?.("room") ?? urlParams?.get?.("roomId") ?? "",
          ),
          roomsCount: Array.isArray(netState.rooms) ? netState.rooms.length : 0,
          lobby: lobby
            ? {
                roomId: lobby.roomId,
                status: lobby.status,
                hostId: lobby.hostId,
                arenaType: lobby.arenaType,
                maxPlayers: lobby.maxPlayers,
                playerCount: lobbyPlayers.length,
                players: lobbyPlayers.map((p) => ({
                  id: p?.id,
                  name: p?.name,
                })),
              }
            : null,
          remotes,
        });
      },
      Math.max(250, Number(netCaseIntervalMs) || 3000),
    );
  }

  function sanitizeRoomIdClient(value) {
    const raw = String(value ?? "");
    const trimmed = raw.trim().slice(0, 64);
    const safe = trimmed.replace(/[^a-zA-Z0-9_-]+/g, "_");
    return safe || "default";
  }

  const NET_POS_SCALE = 100;
  const NET_DIR_SCALE = 10000;
  const NET_SEND_HZ = 15;
  const NET_PROTO_SCHEMA = `syntax = "proto3";

package net;

message PlayerUpdate {
  uint32 pid = 1;
  sint32 x = 2;
  sint32 z = 3;
  sint32 dx = 4;
  sint32 dz = 5;
  uint32 hv = 6;
  uint32 seq = 7;
}`;

  function getNetProto() {
    if (!protoAvailable) return null;
    if (netState.proto) return netState.proto;
    const parsed = globalThis.protobuf.parse(NET_PROTO_SCHEMA);
    const root = parsed.root;
    const PlayerUpdate = root.lookupType("net.PlayerUpdate");
    netState.proto = { PlayerUpdate };
    return netState.proto;
  }

  function createRemotePlayer({ id, num, name }) {
    const p = new Player({
      cubeFactory,
      parent: env.scene,
      mapSize,
      movementBounds:
        typeof getCurrentMovementBounds === "function"
          ? getCurrentMovementBounds()
          : undefined,
      name:
        typeof name === "string" && name.trim()
          ? name.trim().slice(0, 18)
          : "Player",
      speed: baseSpeedAt2,
      tailLength: 0,
      headLevel: 1,
    });
    p.isRemote = true;
    p.remoteId = id;
    p.remoteNum = Number(num) || 0;
    p.eliminated = false;
    p.stunTimer = Infinity;
    if (p.head?.mesh) p.head.mesh.visible = false;
    getStats(p);
    return p;
  }

  function ensureRemotePlayer({ id, num, name }) {
    const remoteId = String(id ?? "");
    if (!remoteId) return null;
    if (netState.remotes.has(remoteId)) return netState.remotes.get(remoteId);
    if (remoteId === netState.playerId) return null;
    const playerNum = Number(num) || 0;
    const remote = createRemotePlayer({ id: remoteId, num: playerNum, name });
    const entry = {
      id: remoteId,
      num: playerNum,
      player: remote,
      target: null,
      dir: null,
      lastSeenAtMs: 0,
    };
    netState.remotes.set(remoteId, entry);
    if (playerNum > 0) netState.remotesByNum.set(playerNum, entry);
    return entry;
  }

  function removeRemotePlayer(remoteId, reason) {
    const entry = netState.remotes.get(remoteId);
    if (!entry) return;
    netLog("remote:remove", { remoteId, reason: String(reason ?? "") });
    netState.remotes.delete(remoteId);
    if (entry.num) netState.remotesByNum.delete(entry.num);

    const p = entry.player;
    const idx = players.indexOf(p);
    if (idx >= 0) players.splice(idx, 1);
    if (env.updatables?.delete) env.updatables.delete(p);
    if (p?.head?.mesh?.parent) p.head.mesh.parent.remove(p.head.mesh);
    if (typeof p?.clearTail === "function") p.clearTail();
  }

  function toU8(raw) {
    if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
    if (ArrayBuffer.isView(raw))
      return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    return null;
  }

  function ensureChannel() {
    if (!multiplayerEnabled) return null;
    if (netState.channel) return netState.channel;
    const channel = geckos({
      url: globalThis.location?.origin ?? "",
      port: null,
    });
    netState.channel = channel;
    netLog("channel:create");

    channel.onConnect((error) => {
      if (error) {
        netState.joined = false;
        netState.playerId = null;
        netState.connected = false;
        netLog("channel:connect:error", {
          message: String(error?.message ?? error),
        });
        return;
      }
      if (channel.id) netState.playerId = String(channel.id);
      netState.connected = true;
      netLog("channel:connect:ok", { id: netState.playerId });
      const pending = netState.pending;
      netState.pending = null;
      if (pending?.type === "rooms:list") {
        netLog("rooms:list-request:pending");
        channel.emit("rooms:list-request", {});
        return;
      }
      if (pending?.type === "room:create") {
        netLog("room:create:pending", pending.payload);
        channel.emit("room:create", pending.payload);
        netState.joined = true;
        netState.roomId = pending.payload?.roomId ?? null;
        return;
      }
      if (pending?.type === "room:join") {
        netLog("room:join:pending", pending.payload);
        channel.emit("room:join", pending.payload);
        netState.joined = true;
        netState.roomId = pending.payload?.roomId ?? null;
        return;
      }
    });

    channel.onDisconnect(() => {
      netLog("channel:disconnect");
      netState.joined = false;
      netState.playerId = null;
      netState.playerNum = null;
      netState.roomId = null;
      netState.connected = false;
      netState.pending = null;
      netState.rooms = [];
      netState.lobby = null;
      netState.remotesByNum.clear();
      lastPayloads.roomsList = null;
      lastPayloads.roomState = null;
      lastPayloads.roomStarted = null;
      if (netCollectLastAtMs?.clear) netCollectLastAtMs.clear();
      if (typeof clearNetCubes === "function") clearNetCubes();
      for (const id of Array.from(netState.remotes.keys()))
        removeRemotePlayer(id, "disconnect");
    });

    channel.on("welcome", (payload) => {
      if (payload?.playerId) netState.playerId = String(payload.playerId);
      netLog("welcome", payload);
    });

    channel.on("rooms:list", (payload) => {
      const rooms = Array.isArray(payload?.rooms) ? payload.rooms : [];
      netState.rooms = rooms;
      lastPayloads.roomsList = rooms;
      netLog("rooms:list", { count: rooms.length });
      if (handlers.onRoomsList) {
        try {
          handlers.onRoomsList(rooms);
        } catch (e) {
          reportHandlerError("onRoomsList", e);
        }
      }
    });

    channel.on("room:state", (payload) => {
      if (!payload?.roomId) return;
      if (netState.roomId && payload.roomId !== netState.roomId) return;
      if (!netState.playerId && channel.id)
        netState.playerId = String(channel.id);
      const prev = netState.roomId;
      netState.roomId = payload.roomId;
      netState.lobby = payload;
      lastPayloads.roomState = payload;
      const playersList = Array.isArray(payload?.players)
        ? payload.players
        : [];
      const me = playersList.find(
        (p) => String(p?.id ?? "") === String(netState.playerId ?? ""),
      );
      if (me && Number.isFinite(Number(me.num)))
        netState.playerNum = Number(me.num) || null;
      for (const p of playersList) {
        const id = String(p?.id ?? "");
        if (!id) continue;
        if (id === String(netState.playerId ?? "")) continue;
        ensureRemotePlayer({ id, num: Number(p?.num) || 0, name: p?.name });
      }
      if (prev !== netState.roomId)
        netLog("room:state:roomId-change", { from: prev, to: netState.roomId });
      netLog("room:state", {
        roomId: payload.roomId,
        status: payload?.status,
        hostId: payload?.hostId,
        arenaType: payload?.arenaType,
        maxPlayers: payload?.maxPlayers,
        players: playersList.map((p) => ({
          id: p?.id,
          num: p?.num,
          name: p?.name,
        })),
      });
      if (handlers.onLobbyState) {
        try {
          handlers.onLobbyState(payload);
        } catch (e) {
          reportHandlerError("onLobbyState", e);
        }
      }
    });

    channel.on("room:started", (payload) => {
      if (!payload?.roomId) return;
      if (netState.roomId && payload.roomId !== netState.roomId) return;
      if (!netState.playerId && channel.id)
        netState.playerId = String(channel.id);
      netState.roomId = payload.roomId;
      lastPayloads.roomStarted = payload;
      const playersList = Array.isArray(payload?.players)
        ? payload.players
        : [];
      if (!netState.playerNum) {
        const me = playersList.find(
          (p) => String(p?.id ?? "") === String(netState.playerId ?? ""),
        );
        if (me && Number.isFinite(Number(me.num)))
          netState.playerNum = Number(me.num) || null;
      }
      for (const p of playersList) {
        const id = String(p?.id ?? "");
        if (!id) continue;
        if (id === String(netState.playerId ?? "")) continue;
        ensureRemotePlayer({ id, num: Number(p?.num) || 0, name: p?.name });
      }
      netLog("room:started", payload);
      channel.emit("room:started:ack", { roomId: payload.roomId });
      netLog("room:started:ack", { roomId: payload.roomId });
      if (handlers.onRoomStarted) {
        try {
          handlers.onRoomStarted(payload);
        } catch (e) {
          reportHandlerError("onRoomStarted", e);
        }
      }
    });

    channel.on("room:error", (payload) => {
      const message = String(payload?.message ?? payload?.error ?? "");
      netLog("room:error", payload);
      if (handlers.onRoomError) {
        try {
          handlers.onRoomError(message);
        } catch (e) {
          reportHandlerError("onRoomError", e);
        }
      }
    });

    channel.on("client:update-sample", (payload) => {
      netLog("client:update-sample:rx", payload);
    });

    channel.on("player:joined", (payload) => {
      const id = String(payload?.player?.id ?? "");
      if (!id) return;
      if (!netState.playerId && channel.id)
        netState.playerId = String(channel.id);
      if (id === netState.playerId) return;
      if (netState.remotes.has(id)) return;
      const num = Number(payload?.player?.num) || 0;
      netLog("player:joined", { id, num, name: payload?.player?.name });
      ensureRemotePlayer({ id, num, name: payload?.player?.name });
    });

    channel.on("player:left", (payload) => {
      const id = String(payload?.playerId ?? "");
      if (!id) return;
      netLog("player:left", payload);
      removeRemotePlayer(id, "player:left");
    });

    channel.on("player:update", (raw) => {
      const proto = getNetProto();
      const bytes = toU8(raw);
      if (!proto || !bytes) {
        netLog("player:update:drop", {
          reason: "no-proto-or-bytes",
          hasProto: Boolean(proto),
          hasBytes: Boolean(bytes),
        });
        return;
      }
      let decoded;
      try {
        decoded = proto.PlayerUpdate.decode(bytes);
      } catch {
        netLog("player:update:decode-error");
        return;
      }
      traffic.rx += 1;
      const pid = Number(decoded?.pid) || 0;
      if (!pid) return;
      if (netState.playerNum && pid === netState.playerNum) return;

      const nowMs = performance.now();
      const lastAt = debugPlayerUpdate.lastRxLogAtMsByPid.get(pid) || 0;
      if (nowMs - lastAt >= 1000) {
        debugPlayerUpdate.lastRxLogAtMsByPid.set(pid, nowMs);
        console.log("rx player:update", {
          pid,
          seq: Number(decoded?.seq) || 0,
          x: Number(decoded?.x),
          z: Number(decoded?.z),
          dx: Number(decoded?.dx),
          dz: Number(decoded?.dz),
          hv: Number(decoded?.hv),
          bytes: bytes.byteLength,
        });
      }

      const entry = netState.remotesByNum.get(pid);
      if (!entry) return;

      entry.lastSeenAtMs = performance.now();
      const x = Number(decoded?.x) / NET_POS_SCALE;
      const z = Number(decoded?.z) / NET_POS_SCALE;
      if (Number.isFinite(x) && Number.isFinite(z)) {
        entry.target = { x, y: 0, z };
        if (entry.player?.head?.mesh) entry.player.head.mesh.visible = true;
      }
      const dx = Number(decoded?.dx) / NET_DIR_SCALE;
      const dz = Number(decoded?.dz) / NET_DIR_SCALE;
      if (Number.isFinite(dx) && Number.isFinite(dz))
        entry.dir = { x: dx, z: dz };
      const hv = Number(decoded?.hv);
      if (Number.isFinite(hv) && hv > 0) entry.player.setHeadValue(hv);
    });

    channel.on("cube:spawn", (payload) => {
      if (!multiplayerEnabled) return;
      if (!getMatchActive?.()) return;
      if (typeof spawnNetCube === "function") spawnNetCube(payload);
    });

    channel.on("cube:collected", (payload) => {
      if (!multiplayerEnabled) return;
      if (!getMatchActive?.()) return;
      if (typeof removeNetCube === "function")
        removeNetCube(payload?.cubeId ?? payload?.id);
    });

    channel.on("tail:enqueue", (payload) => {
      if (!multiplayerEnabled) return;
      if (!getMatchActive?.()) return;
      const playerNum = Number(payload?.playerNum) || 0;
      const value = Math.max(0, Number(payload?.value) || 0);
      if (!playerNum || !(value > 0)) return;
      const target =
        netState.playerNum === playerNum
          ? player
          : netState.remotesByNum.get(playerNum)?.player;
      if (!target) return;
      target.enqueueTailValue(value);
      getStats(target).score += value;
    });

    return channel;
  }

  function netRequestRoomsList() {
    if (!multiplayerEnabled) return;
    const channel = ensureChannel();
    if (!channel) return;
    if (channel.id) netState.playerId = String(channel.id);
    netLog("rooms:list-request");
    if (netState.connected) channel.emit("rooms:list-request", {});
    else netState.pending = { type: "rooms:list" };
  }

  function netCreateRoom({ roomId, arenaType, maxPlayers }) {
    if (!multiplayerEnabled) return;
    const channel = ensureChannel();
    if (!channel) return;
    const payload = {
      roomId: sanitizeRoomIdClient(roomId),
      name: getPlayerName(player),
      arenaType:
        String(arenaType ?? "")
          .trim()
          .toLowerCase() || "default",
      maxPlayers: Math.max(2, Math.min(20, Number(maxPlayers) || 8)),
    };
    netLog("room:create", payload);
    if (netState.connected) {
      channel.emit("room:create", payload);
      netState.joined = true;
      netState.roomId = payload.roomId;
    } else {
      netState.pending = { type: "room:create", payload };
      netState.roomId = payload.roomId;
    }
  }

  function netJoinExistingRoom(roomId) {
    if (!multiplayerEnabled) return;
    const channel = ensureChannel();
    if (!channel) return;
    const payload = {
      roomId: sanitizeRoomIdClient(roomId),
      name: getPlayerName(player),
    };
    netLog("room:join", payload);
    if (netState.connected) {
      channel.emit("room:join", payload);
      netState.joined = true;
      netState.roomId = payload.roomId;
    } else {
      netState.pending = { type: "room:join", payload };
      netState.roomId = payload.roomId;
    }
  }

  function netStartRoom() {
    if (!multiplayerEnabled) return;
    const channel = netState.channel;
    if (!channel || !netState.roomId) return;
    netLog("room:start", { roomId: netState.roomId });
    channel.emit("room:start", { roomId: netState.roomId });
  }

  function netLeaveRoom() {
    if (!multiplayerEnabled) return;
    const channel = netState.channel;
    netLog("room:leave", { roomId: netState.roomId });
    if (channel && netState.joined)
      channel.emit("room:leave", { roomId: netState.roomId });
    netState.joined = false;
    netState.roomId = null;
    netState.lobby = null;
    netState.playerNum = null;
    if (netCollectLastAtMs?.clear) netCollectLastAtMs.clear();
    if (typeof clearNetCubes === "function") clearNetCubes();
    for (const id of Array.from(netState.remotes.keys()))
      removeRemotePlayer(id, "room:leave");
  }

  function update(dt) {
    if (!multiplayerEnabled) return;
    const nowMs = performance.now();
    const channel = netState.channel;
    if (!channel || !netState.joined || !netState.roomId) {
      if (nowMs - (traffic.lastSkipLogAtMs || 0) > 2500) {
        traffic.lastSkipLogAtMs = nowMs;
        netLog("update:skip", {
          hasChannel: Boolean(channel),
          joined: netState.joined,
          roomId: netState.roomId,
        });
      }
      maybeEmitUpdateSample({
        channel,
        nowMs,
        reason: "skip:channel-or-join-or-room",
        hasProto: netState.proto,
      });
      return;
    }
    if (!netState.playerId && channel.id)
      netState.playerId = String(channel.id);
    if (!netState.playerId) {
      maybeEmitUpdateSample({
        channel,
        nowMs,
        reason: "skip:no-playerId",
        hasProto: netState.proto,
      });
      return;
    }
    if (!getPlayerJoined?.()) {
      maybeEmitUpdateSample({
        channel,
        nowMs,
        reason: "skip:not-playing",
        hasProto: netState.proto,
      });
      return;
    }
    const proto = getNetProto();
    if (!proto) {
      maybeEmitUpdateSample({
        channel,
        nowMs,
        reason: "skip:no-proto",
        hasProto: proto,
      });
      return;
    }
    if (!netState.playerNum) {
      const lobbyPlayers = Array.isArray(netState.lobby?.players)
        ? netState.lobby.players
        : [];
      const me = lobbyPlayers.find(
        (p) => String(p?.id ?? "") === String(netState.playerId ?? ""),
      );
      if (me && Number.isFinite(Number(me.num)))
        netState.playerNum = Number(me.num) || null;
    }
    if (!netState.playerNum) {
      maybeEmitUpdateSample({
        channel,
        nowMs,
        reason: "skip:no-playerNum",
        hasProto: proto,
      });
      return;
    }

    if (nowMs - (netState.lastSentAtMs || 0) >= 1000 / NET_SEND_HZ) {
      netState.lastSentAtMs = nowMs;
      const pos = player.head?.mesh?.position;
      const dir = player.headDirection;
      const x = Math.round((Number(pos?.x ?? 0) || 0) * NET_POS_SCALE);
      const z = Math.round((Number(pos?.z ?? 0) || 0) * NET_POS_SCALE);
      const dl =
        Math.sqrt(
          (dir?.x ?? 0) * (dir?.x ?? 0) + (dir?.z ?? 0) * (dir?.z ?? 0),
        ) || 1;
      const dx = Math.round(((dir?.x ?? 0) / dl) * NET_DIR_SCALE);
      const dz = Math.round(((dir?.z ?? 0) / dl) * NET_DIR_SCALE);
      const hv = Math.max(0, Number(player.head?.value ?? 0) || 0);
      netState.seq = (Number(netState.seq) + 1) >>> 0;
      const message = {
        pid: netState.playerNum,
        x,
        z,
        dx,
        dz,
        hv,
        seq: netState.seq,
      };
      const bytes = proto.PlayerUpdate.encode(message).finish();
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      const usingRaw = typeof channel?.raw?.emit === "function";
      if (usingRaw) channel.raw.emit("player:update", ab);
      else channel.emit("player:update", ab);
      traffic.tx += 1;
      debugClient.lastTx = message;
      debugClient.lastTxBytes = ab.byteLength;

      if (nowMs - (debugPlayerUpdate.lastTxLogAtMs || 0) >= 1000) {
        debugPlayerUpdate.lastTxLogAtMs = nowMs;
        console.log("tx player:update", {
          pid: message.pid,
          seq: message.seq,
          x: message.x,
          z: message.z,
          dx: message.dx,
          dz: message.dz,
          hv: message.hv,
          bytes: ab.byteLength,
          usingRaw,
        });
      }
    }

    maybeEmitUpdateSample({ channel, nowMs, reason: "ok", hasProto: proto });

    if (netLogEnabled) {
      const elapsed = nowMs - (traffic.lastRateLogAtMs || 0);
      if (elapsed >= 2000) {
        const sec = Math.max(0.001, elapsed / 1000);
        const txps = Number((traffic.tx / sec).toFixed(2));
        const rxps = Number((traffic.rx / sec).toFixed(2));
        traffic.tx = 0;
        traffic.rx = 0;
        traffic.lastRateLogAtMs = nowMs;
        netLog("rate", {
          txps,
          rxps,
          playerNum: netState.playerNum,
          roomId: netState.roomId,
          remotes: netState.remotes.size,
        });
      }
    }

    const alpha = 1 - Math.pow(0.0001, (Number(dt) || 0) * 10);
    const staleMs = 120000;
    for (const [id, entry] of netState.remotes.entries()) {
      const p = entry.player;
      if (!p?.head?.mesh) continue;
      if (nowMs - (entry.lastSeenAtMs || 0) > staleMs) {
        continue;
      }

      const target = entry.target;
      if (target) {
        const mesh = p.head.mesh;
        mesh.position.x = THREE.MathUtils.lerp(
          mesh.position.x,
          target.x,
          alpha,
        );
        mesh.position.z = THREE.MathUtils.lerp(
          mesh.position.z,
          target.z,
          alpha,
        );
        mesh.position.y = p.head.size / 2;
      }
      const d = entry.dir;
      if (d) p.setLookDirFromMove(d.x, d.z);
    }
  }

  function onMatchStarted(payload) {
    if (!multiplayerEnabled) return;
    if (setFreeCubeSpawnerEnabled) setFreeCubeSpawnerEnabled(false);
    if (typeof clearNetCubes === "function") clearNetCubes();
    const cubes = Array.isArray(payload?.cubes) ? payload.cubes : [];
    for (const c of cubes)
      if (typeof spawnNetCube === "function") spawnNetCube(c);
  }

  function requestCollectCube(cubeId) {
    if (!multiplayerEnabled) return false;
    const id = Number(cubeId) || 0;
    if (!id) return false;
    const channel = netState.channel;
    if (!channel || !netState.joined) return false;
    const nowMs = performance.now();
    const last = Number(netCollectLastAtMs?.get?.(id) || 0);
    if (nowMs - last < 250) return false;
    netCollectLastAtMs?.set?.(id, nowMs);
    channel.emit("cube:collect", { cubeId: id });
    return true;
  }

  return {
    netState,
    netLog,
    setHandlers,
    ensureRemotePlayer,
    ensureChannel,
    netRequestRoomsList,
    netCreateRoom,
    netJoinExistingRoom,
    netStartRoom,
    netLeaveRoom,
    update,
    onMatchStarted,
    requestCollectCube,
  };
}
