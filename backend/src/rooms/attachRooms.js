import { createNetLog } from "../net/createNetLog.js";

export function attachRooms(io, netConfig) {
  const rooms = new Map();
  const channelStats = new Map();
  const channelRoomIds = new Map();
  const matches = new Map();

  const importantEvents = new Set([
    "connect",
    "disconnect",
    "rooms:list-request",
    "room:create",
    "room:join",
    "room:start",
    "room:started:ack",
    "client:started",
    "client:update-sample",
    "player:update:rx",
    "player:update:drop",
    "room:leave:request",
    "room:leave",
    "room:host-change",
    "room:empty",
    "room:error",
    "rooms:case",
    "voice:ready",
    "voice:signal",
    "voice:hangup",
  ]);

  const netLog = createNetLog({
    enabled: Boolean(netConfig?.logEnabled),
    importantEnabled: netConfig?.logImportantEnabled !== false,
    importantEvents,
  });

  const MAP_SIZE = 64;
  const DEFAULT_CUBE_VALUES = [1, 2, 4, 8, 16];

  function normalizeArenaType(value) {
    return String(value ?? "default").trim().toLowerCase() || "default";
  }

  function movementBoundsForArena(arenaType, size) {
    const t = normalizeArenaType(arenaType);
    const s = Math.max(1, Number(size) || 1);
    if (t === "football" || t === "soccer") {
      const pitchW = s * 0.92;
      const targetAspect = 105 / 68;
      const pitchH = pitchW / targetAspect;
      return { halfX: pitchW / 2, halfZ: pitchH / 2 };
    }
    const half = s / 2;
    return { halfX: half, halfZ: half };
  }

  function createRng(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return function next() {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function pickSpawnXZ(rng, bounds, used, { margin = 1.2, avoidDist = 8 } = {}) {
    const halfX = Number(bounds?.halfX) > 0 ? Number(bounds.halfX) : MAP_SIZE / 2;
    const halfZ = Number(bounds?.halfZ) > 0 ? Number(bounds.halfZ) : MAP_SIZE / 2;
    const minX = -halfX + margin;
    const maxX = halfX - margin;
    const minZ = -halfZ + margin;
    const maxZ = halfZ - margin;
    const avoid2 = avoidDist * avoidDist;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = minX + (maxX - minX) * rng();
      const z = minZ + (maxZ - minZ) * rng();
      let ok = true;
      for (const p of used) {
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < avoid2) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const pos = { x, z };
        used.push(pos);
        return pos;
      }
    }
    const x = minX + (maxX - minX) * rng();
    const z = minZ + (maxZ - minZ) * rng();
    const pos = { x, z };
    used.push(pos);
    return pos;
  }

  function stopMatch(roomId) {
    const match = matches.get(roomId);
    if (!match) return;
    if (match.spawnTimer) clearInterval(match.spawnTimer);
    matches.delete(roomId);
  }

  function summarizeRooms() {
    return Array.from(rooms.values()).map((room) => ({
      roomId: room.roomId,
      status: room.status,
      arenaType: room.arenaType,
      maxPlayers: room.maxPlayers,
      hostId: room.hostId,
      playerCount: room.players.size,
      players: Array.from(room.players.values()).map((p) => ({ id: p.id, name: p.name })),
    }));
  }

  function summarizeConnections() {
    const now = Date.now();
    return Array.from(channelStats.values()).map((s) => ({
      id: s.id,
      roomId: s.roomId ?? null,
      name: s.name ?? null,
      connectedSec: ((now - (s.connectedAtMs || now)) / 1000).toFixed(1),
      lastSeenSec: s.lastSeenAtMs ? ((now - s.lastSeenAtMs) / 1000).toFixed(1) : null,
      updates: s.updateCount || 0,
      updatesPerSec: s.connectedAtMs
        ? Number(((s.updateCount || 0) / Math.max(1, (now - s.connectedAtMs) / 1000)).toFixed(2))
        : 0,
      lastUpdateSec: s.lastUpdateAtMs ? ((now - s.lastUpdateAtMs) / 1000).toFixed(1) : null,
      lastUpdateBytes: s.lastUpdateBytes || 0,
    }));
  }

  let lastRoomsCaseJson = "";
  function logRoomsCaseIfChanged() {
    if (netConfig?.roomsCaseEnabled === false) return;
    const snapshot = summarizeRooms();
    const json = JSON.stringify(snapshot);
    if (json === lastRoomsCaseJson) return;
    lastRoomsCaseJson = json;
    netLog("rooms:case", { rooms: snapshot });
  }

  function logStatus() {
    if (!netConfig?.logSnapshotEnabled) return;
    netLog("status", {
      connections: channelStats.size,
      rooms: rooms.size,
      roomsData: summarizeRooms(),
      connectionsData: summarizeConnections(),
    });
  }

  logRoomsCaseIfChanged();
  logStatus();

  function sanitizeRoomId(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > 64) return null;
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
    return trimmed;
  }

  function getOrCreateRoom(roomId) {
    const existing = rooms.get(roomId);
    if (existing) return existing;
    const room = {
      roomId,
      createdAt: Date.now(),
      status: "waiting",
      hostId: null,
      arenaType: "default",
      maxPlayers: 8,
      players: new Map(),
      nextPlayerNum: 1,
    };
    rooms.set(roomId, room);
    return room;
  }

  function assignPlayerNum(room) {
    const next = Number(room?.nextPlayerNum) || 1;
    const chosen = next > 0 ? next : 1;
    room.nextPlayerNum = chosen + 1;
    return chosen;
  }

  function roomSnapshot(room) {
    return {
      roomId: room.roomId,
      createdAt: room.createdAt,
      status: room.status,
      hostId: room.hostId,
      arenaType: room.arenaType,
      maxPlayers: room.maxPlayers,
      players: Array.from(room.players.values()).map((p) => ({
        id: p.id,
        num: p.num,
        name: p.name,
        joinedAt: p.joinedAt,
      })),
    };
  }

  function roomsListSnapshot() {
    return Array.from(rooms.values()).map((room) => ({
      roomId: room.roomId,
      status: room.status,
      hostId: room.hostId,
      arenaType: room.arenaType,
      maxPlayers: room.maxPlayers,
      playerCount: room.players.size,
      createdAt: room.createdAt,
    }));
  }

  function broadcastRoomsList() {
    io.emit("rooms:list", { rooms: roomsListSnapshot() });
    logRoomsCaseIfChanged();
    logStatus();
  }

  function emitRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    io.room(roomId).emit("room:state", roomSnapshot(room));
    logStatus();
  }

  function emitExistingPlayersTo(channel, room) {
    if (!channel || !room) return;
    for (const p of room.players.values()) {
      if (!p?.id) continue;
      if (p.id === channel.id) continue;
      channel.emit("player:joined", {
        roomId: room.roomId,
        player: { id: p.id, num: p.num, name: p.name, joinedAt: p.joinedAt },
      });
    }
  }

  function getChannelRoomId(channel) {
    if (!channel?.id) return null;
    return channelRoomIds.get(channel.id) ?? channel.roomId ?? null;
  }

  function setChannelRoomId(channel, roomId) {
    if (!channel?.id) return;
    if (!roomId) channelRoomIds.delete(channel.id);
    else channelRoomIds.set(channel.id, roomId);
  }

  function sendRoomError(channel, message) {
    netLog("room:error", { id: channel?.id, roomId: getChannelRoomId(channel), message: String(message ?? "") });
    channel.emit("room:error", { message: String(message ?? "Error") });
  }

  function touchChannel(id, patch) {
    if (!id) return;
    const now = Date.now();
    const prev = channelStats.get(id) ?? { id, connectedAtMs: now, updateCount: 0, lastUpdateBytes: 0 };
    const next = { ...prev, ...patch, id, lastSeenAtMs: now };
    channelStats.set(id, next);
  }

  function normalizeBinary(raw) {
    if (raw instanceof ArrayBuffer) return raw;
    if (ArrayBuffer.isView(raw)) return raw;
    if (raw && typeof raw === "object" && raw.type === "Buffer" && Array.isArray(raw.data)) {
      return Uint8Array.from(raw.data);
    }
    if (Array.isArray(raw)) {
      return Uint8Array.from(raw);
    }
    return null;
  }

  function toArrayBuffer(payload) {
    if (!payload) return null;
    if (payload instanceof ArrayBuffer) return payload;
    if (ArrayBuffer.isView(payload)) {
      return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    }
    return null;
  }

  const updateDrops = new Map();
  const updateRxLog = new Map();

  function leaveRoom(channel) {
    const roomId = getChannelRoomId(channel);
    if (!roomId) return null;
    const room = rooms.get(roomId);
    if (!room) return null;

    const player = room.players.get(channel.id);
    room.players.delete(channel.id);
    try {
      channel.leave();
    } catch {
    }
    setChannelRoomId(channel, null);
    io.room(roomId).emit("player:left", { roomId, playerId: channel.id });
    if (room.players.size === 0) {
      netLog("room:empty", { roomId });
      stopMatch(roomId);
      rooms.delete(roomId);
    } else if (room.hostId === channel.id) {
      const nextHost = room.players.values().next().value;
      room.hostId = nextHost?.id ?? null;
      netLog("room:host-change", { roomId, from: channel.id, to: room.hostId });
    }
    if (rooms.has(roomId)) emitRoomState(roomId);
    broadcastRoomsList();
    netLog("room:leave", { id: channel.id, roomId, remaining: room.players.size });
    touchChannel(channel.id, { roomId: null });
    return { roomId, player };
  }

  io.onConnection((channel) => {
    netLog("connect", { id: channel.id });
    channel.emit("welcome", { playerId: channel.id });
    setChannelRoomId(channel, channel.roomId ?? null);
    touchChannel(channel.id, { roomId: getChannelRoomId(channel) });
    logStatus();

    channel.on("rooms:list-request", () => {
      netLog("rooms:list-request", { id: channel.id });
      touchChannel(channel.id, {});
      channel.emit("rooms:list", { rooms: roomsListSnapshot() });
    });

    channel.on("room:create", (payload) => {
      const roomId = sanitizeRoomId(payload?.roomId);
      const name = typeof payload?.name === "string" ? payload.name.trim().slice(0, 24) : "Player";
      const arenaType = typeof payload?.arenaType === "string" ? payload.arenaType.trim().toLowerCase() : "default";
      const maxPlayers = Math.max(2, Math.min(20, Number(payload?.maxPlayers) || 8));
      if (!roomId) return sendRoomError(channel, "Invalid room id");
      if (!name) return sendRoomError(channel, "Invalid name");
      if (rooms.has(roomId)) return sendRoomError(channel, "Room already exists");
      netLog("room:create", { id: channel.id, roomId, name, arenaType, maxPlayers });
      touchChannel(channel.id, { name });

      leaveRoom(channel);

      const room = getOrCreateRoom(roomId);
      room.status = "waiting";
      room.hostId = channel.id;
      room.arenaType = arenaType || "default";
      room.maxPlayers = maxPlayers;

      const player = { id: channel.id, num: assignPlayerNum(room), name: name || "Player", joinedAt: Date.now() };
      room.players.set(channel.id, player);
      channel.join(roomId);
      setChannelRoomId(channel, roomId);
      touchChannel(channel.id, { roomId });

      io.room(roomId).emit("player:joined", {
        roomId,
        player: { id: player.id, num: player.num, name: player.name, joinedAt: player.joinedAt },
      });

      emitExistingPlayersTo(channel, room);
      emitRoomState(roomId);
      channel.emit("room:state", roomSnapshot(room));
      broadcastRoomsList();
    });

    channel.on("room:join", (payload) => {
      const roomId = sanitizeRoomId(payload?.roomId);
      const name = typeof payload?.name === "string" ? payload.name.trim().slice(0, 24) : "Player";
      if (!roomId) return sendRoomError(channel, "Invalid room id");
      const room = rooms.get(roomId);
      if (!room) return sendRoomError(channel, "Room not found");
      if (room.players.size >= room.maxPlayers) return sendRoomError(channel, "Room is full");
      netLog("room:join", { id: channel.id, roomId, name });
      touchChannel(channel.id, { name });

      leaveRoom(channel);

      const player = { id: channel.id, num: assignPlayerNum(room), name: name || "Player", joinedAt: Date.now() };
      room.players.set(channel.id, player);
      channel.join(roomId);
      setChannelRoomId(channel, roomId);
      touchChannel(channel.id, { roomId });

      io.room(roomId).emit("player:joined", {
        roomId,
        player: { id: player.id, num: player.num, name: player.name, joinedAt: player.joinedAt },
      });

      emitExistingPlayersTo(channel, room);
      emitRoomState(roomId);
      channel.emit("room:state", roomSnapshot(room));
      broadcastRoomsList();

      if (room.status === "started") {
        const match = matches.get(roomId);
        if (!match) return;
        const pos = pickSpawnXZ(match.rng, match.bounds, match.usedSpawns, { margin: 1.8, avoidDist: 10 });
        const angle = match.rng() * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        match.spawns.push({ num: player.num, x: pos.x, z: pos.z, dx, dz });
        channel.emit("room:started", {
          roomId,
          arenaType: room.arenaType,
          seed: match.seed,
          mapSize: MAP_SIZE,
          players: Array.from(room.players.values()).map((p) => ({ id: p.id, num: p.num, name: p.name })),
          spawns: match.spawns,
          cubes: Array.from(match.cubes.values()),
        });
      }
    });

    channel.on("room:leave", () => {
      netLog("room:leave:request", { id: channel.id, roomId: getChannelRoomId(channel) });
      touchChannel(channel.id, {});
      leaveRoom(channel);
    });

    channel.on("room:start", (payload) => {
      const roomId = sanitizeRoomId(payload?.roomId) ?? getChannelRoomId(channel);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      if (room.hostId !== channel.id) return sendRoomError(channel, "Only host can start");
      if (room.status !== "waiting") return;
      if (room.players.size < 2) return sendRoomError(channel, "Need at least 2 players");

      room.status = "started";
      netLog("room:start", { id: channel.id, roomId, arenaType: room.arenaType, players: room.players.size });
      touchChannel(channel.id, {});
      emitRoomState(roomId);
      broadcastRoomsList();

      stopMatch(roomId);

      const seed = (Math.random() * 4294967296) >>> 0;
      const rng = createRng(seed);
      const bounds = movementBoundsForArena(room.arenaType, MAP_SIZE);
      const players = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        num: p.num,
        name: p.name,
      }));
      const usedSpawns = [];
      const spawns = players.map((p) => {
        const pos = pickSpawnXZ(rng, bounds, usedSpawns, { margin: 1.8, avoidDist: 10 });
        const angle = rng() * Math.PI * 2;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        return { num: p.num, x: pos.x, z: pos.z, dx, dz };
      });

      const maxCubes = 180;
      const initialCubes = Math.min(80, maxCubes);
      const cubes = new Map();
      let nextCubeId = 1;
      const usedCubePos = [];
      for (let i = 0; i < initialCubes; i += 1) {
        const value = DEFAULT_CUBE_VALUES[(rng() * DEFAULT_CUBE_VALUES.length) | 0] ?? 1;
        const pos = pickSpawnXZ(rng, bounds, usedCubePos, { margin: 1.6, avoidDist: 2.4 });
        const cube = { id: nextCubeId++, value, x: pos.x, z: pos.z };
        cubes.set(cube.id, cube);
      }

      const match = {
        roomId,
        seed,
        arenaType: room.arenaType,
        bounds,
        rng,
        maxCubes,
        nextCubeId,
        cubes,
        spawns,
        usedSpawns,
        usedCubePos,
        spawnTimer: null,
      };

      match.spawnTimer = setInterval(() => {
        const r = rooms.get(roomId);
        if (!r || r.status !== "started") return;
        if (match.cubes.size >= match.maxCubes) return;
        const value = DEFAULT_CUBE_VALUES[(match.rng() * DEFAULT_CUBE_VALUES.length) | 0] ?? 1;
        const pos = pickSpawnXZ(match.rng, match.bounds, match.usedCubePos, { margin: 1.6, avoidDist: 2.4 });
        const cube = { id: match.nextCubeId++, value, x: pos.x, z: pos.z };
        match.cubes.set(cube.id, cube);
        io.room(roomId).emit("cube:spawn", cube);
      }, 700).unref?.();

      matches.set(roomId, match);

      io.room(roomId).emit("room:started", {
        roomId,
        arenaType: room.arenaType,
        seed,
        mapSize: MAP_SIZE,
        players,
        spawns,
        cubes: Array.from(cubes.values()),
      });
    });

    channel.on("room:started:ack", (payload) => {
      const roomId = sanitizeRoomId(payload?.roomId) ?? getChannelRoomId(channel);
      const room = roomId ? rooms.get(roomId) : null;
      const playerNum = room?.players?.get?.(channel.id)?.num ?? null;
      netLog("room:started:ack", { id: channel.id, roomId, playerNum });
      touchChannel(channel.id, {});
    });

    channel.on("client:started", (payload) => {
      const roomId = sanitizeRoomId(payload?.roomId) ?? getChannelRoomId(channel);
      const room = roomId ? rooms.get(roomId) : null;
      const playerNum = Number(payload?.playerNum) || (room?.players?.get?.(channel.id)?.num ?? null);
      const joined = payload?.joined === true;
      const paused = payload?.paused === true;
      netLog("client:started", { id: channel.id, roomId, playerNum, joined, paused });
      touchChannel(channel.id, {});
    });

    channel.on("client:update-sample", (payload) => {
      const roomId = sanitizeRoomId(payload?.roomId) ?? getChannelRoomId(channel);
      netLog("client:update-sample", {
        id: channel.id,
        roomId,
        playerNum: payload?.playerNum,
        reason: payload?.reason,
        joined: payload?.joined,
        playing: payload?.playing,
        connected: payload?.connected,
        hasChannel: payload?.hasChannel,
        hasProto: payload?.hasProto,
        usingRaw: payload?.usingRaw,
        seq: payload?.seq,
        x: payload?.x,
        z: payload?.z,
        dx: payload?.dx,
        dz: payload?.dz,
        hv: payload?.hv,
        bytes: payload?.bytes,
      });
      touchChannel(channel.id, {});

      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || !room.players.has(channel.id)) return;
      io.room(roomId).emit("client:update-sample", {
        fromId: channel.id,
        roomId,
        playerNum: payload?.playerNum,
        reason: payload?.reason,
        joined: payload?.joined,
        playing: payload?.playing,
        connected: payload?.connected,
        hasChannel: payload?.hasChannel,
        hasProto: payload?.hasProto,
        usingRaw: payload?.usingRaw,
        seq: payload?.seq,
        x: payload?.x,
        z: payload?.z,
        dx: payload?.dx,
        dz: payload?.dz,
        hv: payload?.hv,
        bytes: payload?.bytes,
        serverAtMs: Date.now(),
      });
    });

    channel.on("cube:collect", (payload) => {
      const roomId = getChannelRoomId(channel);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || room.status !== "started") return;
      const match = matches.get(roomId);
      if (!match) return;
      const player = room.players.get(channel.id);
      if (!player) return;
      const cubeId = Number(payload?.cubeId ?? payload?.id);
      if (!Number.isFinite(cubeId) || cubeId <= 0) return;
      const cube = match.cubes.get(cubeId);
      if (!cube) return;
      match.cubes.delete(cubeId);
      io.room(roomId).emit("cube:collected", { cubeId, by: player.num, value: cube.value });
      io.room(roomId).emit("tail:enqueue", { playerNum: player.num, value: cube.value });
    });

    channel.on("voice:ready", (payload) => {
      const roomId = getChannelRoomId(channel);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || !room.players.has(channel.id)) return;
      netLog("voice:ready", { id: channel.id, roomId });
      touchChannel(channel.id, {});
      io.room(roomId).emit("voice:ready", {
        roomId,
        fromId: channel.id,
        enabled: payload?.enabled !== false,
      });
    });

    channel.on("voice:hangup", () => {
      const roomId = getChannelRoomId(channel);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || !room.players.has(channel.id)) return;
      netLog("voice:hangup", { id: channel.id, roomId });
      touchChannel(channel.id, {});
      io.room(roomId).emit("voice:hangup", { roomId, fromId: channel.id });
    });

    channel.on("voice:signal", (payload) => {
      const roomId = getChannelRoomId(channel);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room || !room.players.has(channel.id)) return;

      const kind = String(payload?.kind ?? "");
      const toId = String(payload?.toId ?? "");
      if (!toId) return;
      if (kind !== "offer" && kind !== "answer" && kind !== "ice") return;

      let data = payload?.data ?? null;
      if (kind === "ice") {
        const candidate = typeof data?.candidate === "string" ? data.candidate.slice(0, 4096) : "";
        const sdpMid = typeof data?.sdpMid === "string" ? data.sdpMid.slice(0, 128) : null;
        const sdpMLineIndex = Number.isFinite(Number(data?.sdpMLineIndex))
          ? Number(data.sdpMLineIndex)
          : null;
        data = { candidate, sdpMid, sdpMLineIndex };
      } else {
        const sdp = typeof data?.sdp === "string" ? data.sdp.slice(0, 140000) : "";
        const type = kind;
        data = { type, sdp };
      }

      netLog("voice:signal", { id: channel.id, roomId, kind });
      touchChannel(channel.id, {});
      io.room(roomId).emit("voice:signal", {
        roomId,
        fromId: channel.id,
        toId,
        kind,
        data,
      });
    });

    function handlePlayerUpdate(raw) {
      const roomId = getChannelRoomId(channel);
      if (!roomId) return;
      const room = rooms.get(roomId);
      if (!room) return;
      if (!room.players.has(channel.id)) return;

      const normalized = normalizeBinary(raw);
      const ab = toArrayBuffer(normalized);
      if (!ab) {
        const now = Date.now();
        const prev = updateDrops.get(channel.id) ?? { lastAt: 0 };
        if (now - prev.lastAt > 2000) {
          updateDrops.set(channel.id, { lastAt: now });
          netLog("player:update:drop", {
            id: channel.id,
            roomId,
            rawType: typeof raw,
            ctor: raw?.constructor?.name,
            keys: raw && typeof raw === "object" ? Object.keys(raw).slice(0, 8) : null,
          });
        }
        return;
      }
      const bytes = ab.byteLength;
      const prev = channelStats.get(channel.id);
      const nextCount = (prev?.updateCount || 0) + 1;
      touchChannel(channel.id, { roomId, updateCount: nextCount, lastUpdateAtMs: Date.now(), lastUpdateBytes: bytes });

      const now = Date.now();
      const prevLog = updateRxLog.get(channel.id) ?? 0;
      if (now - prevLog >= 1000) {
        updateRxLog.set(channel.id, now);
        netLog("player:update:rx", { id: channel.id, roomId, bytes });
      }

      if (io?.raw?.room && typeof io.raw.room === "function") {
        io.raw.room(roomId).emit(ab);
      }
      io.room(roomId).emit("player:update", ab);
    }

    channel.on("player:update", handlePlayerUpdate);
    if (typeof channel?.onRaw === "function") channel.onRaw(handlePlayerUpdate);

    channel.onDisconnect(() => {
      netLog("disconnect", { id: channel.id, roomId: getChannelRoomId(channel) });
      leaveRoom(channel);
      channelStats.delete(channel.id);
      channelRoomIds.delete(channel.id);
      logStatus();
    });

    broadcastRoomsList();
  });

  return { rooms, channelStats, netLog };
}
