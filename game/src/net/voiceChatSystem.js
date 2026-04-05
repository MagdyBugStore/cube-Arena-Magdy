export function createVoiceChatSystem({
  multiplayerEnabled,
  netState,
  ensureChannel,
  iceServers,
} = {}) {
  const peers = new Map();
  const remoteReady = new Map();

  const state = {
    enabled: false,
    micMuted: false,
    localStream: null,
    status: "",
    lastReadyAtMs: 0,
    boundChannel: null,
  };

  function setStatus(text) {
    state.status = String(text ?? "");
  }

  function isSupported() {
    return (
      typeof globalThis.RTCPeerConnection === "function" &&
      typeof globalThis.RTCSessionDescription === "function" &&
      typeof globalThis.RTCIceCandidate === "function" &&
      Boolean(globalThis.navigator?.mediaDevices?.getUserMedia)
    );
  }

  function getMyId() {
    return String(netState?.playerId ?? "");
  }

  function getRoomId() {
    return String(netState?.roomId ?? "");
  }

  function getDefaultIceServers() {
    if (Array.isArray(iceServers) && iceServers.length > 0) return iceServers;
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }

  function ensureRemoteAudioEl(remoteId) {
    const elId = `voice-audio-${remoteId}`;
    const existing = document.getElementById(elId);
    if (existing && existing.tagName === "AUDIO") return existing;
    const audio = document.createElement("audio");
    audio.id = elId;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = false;
    audio.muted = false;
    audio.style.display = "none";
    document.body.append(audio);
    return audio;
  }

  function closePeer(remoteId, reason) {
    const entry = peers.get(remoteId);
    if (!entry) return;
    peers.delete(remoteId);
    try {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
    } catch {
    }
    try {
      entry.pc.close();
    } catch {
    }
    setStatus(reason ? String(reason) : state.status);
  }

  function closeAllPeers(reason) {
    for (const remoteId of Array.from(peers.keys())) closePeer(remoteId, reason);
  }

  function setMicMuted(muted) {
    state.micMuted = Boolean(muted);
    try {
      for (const t of state.localStream?.getAudioTracks?.() ?? []) t.enabled = !state.micMuted;
    } catch {
    }
  }

  function sendReady(channel) {
    if (!state.enabled) return;
    if (!channel) return;
    const roomId = getRoomId();
    if (!roomId) return;
    if (!netState?.joined) return;
    try {
      channel.emit("voice:ready", { roomId, enabled: true });
      state.lastReadyAtMs = performance.now();
    } catch {
    }
  }

  function sendHangup(channel) {
    if (!channel) return;
    const roomId = getRoomId();
    if (!roomId) return;
    try {
      channel.emit("voice:hangup", { roomId });
    } catch {
    }
  }

  function sendSignal(channel, { toId, kind, data } = {}) {
    if (!state.enabled) return;
    if (!channel) return;
    const roomId = getRoomId();
    if (!roomId) return;
    if (!netState?.joined) return;
    try {
      channel.emit("voice:signal", {
        roomId,
        toId: String(toId ?? ""),
        kind: String(kind ?? ""),
        data,
      });
    } catch {
    }
  }

  function shouldInitiateOffer(remoteId) {
    const mine = getMyId();
    const theirs = String(remoteId ?? "");
    if (!mine || !theirs) return false;
    return mine < theirs;
  }

  function ensurePeer(remoteId, channel) {
    const id = String(remoteId ?? "");
    if (!id) return null;
    if (!state.enabled) return null;
    if (peers.has(id)) return peers.get(id);

    const pc = new RTCPeerConnection({ iceServers: getDefaultIceServers() });

    for (const track of state.localStream?.getTracks?.() ?? []) {
      try {
        pc.addTrack(track, state.localStream);
      } catch {
      }
    }

    pc.onicecandidate = (evt) => {
      const c = evt?.candidate;
      if (!c) return;
      sendSignal(channel, {
        toId: id,
        kind: "ice",
        data: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex },
      });
    };

    pc.ontrack = (evt) => {
      const stream = evt?.streams?.[0] ?? null;
      if (!stream) return;
      const audio = ensureRemoteAudioEl(id);
      if (audio.srcObject !== stream) audio.srcObject = stream;
      const play = audio.play?.();
      if (play && typeof play.catch === "function") play.catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "failed" || s === "disconnected" || s === "closed") {
        closePeer(id, `voice:${s}`);
      }
    };

    const entry = { pc, remoteId: id, createdAtMs: performance.now() };
    peers.set(id, entry);
    return entry;
  }

  async function createAndSendOffer(remoteId, channel) {
    const entry = ensurePeer(remoteId, channel);
    if (!entry) return;
    const pc = entry.pc;
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      sendSignal(channel, { toId: remoteId, kind: "offer", data: { type: "offer", sdp: offer.sdp } });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e ?? "voice offer error"));
    }
  }

  async function handleOffer(fromId, channel, data) {
    const entry = ensurePeer(fromId, channel);
    if (!entry) return;
    const pc = entry.pc;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: String(data?.sdp ?? "") }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(channel, { toId: fromId, kind: "answer", data: { type: "answer", sdp: answer.sdp } });
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e ?? "voice answer error"));
    }
  }

  async function handleAnswer(fromId, channel, data) {
    const entry = ensurePeer(fromId, channel);
    if (!entry) return;
    const pc = entry.pc;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: String(data?.sdp ?? "") }));
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e ?? "voice remote answer error"));
    }
  }

  async function handleIce(fromId, channel, data) {
    const entry = ensurePeer(fromId, channel);
    if (!entry) return;
    const pc = entry.pc;
    try {
      const candidate = String(data?.candidate ?? "");
      if (!candidate) return;
      await pc.addIceCandidate(
        new RTCIceCandidate({
          candidate,
          sdpMid: data?.sdpMid ?? null,
          sdpMLineIndex: Number.isFinite(Number(data?.sdpMLineIndex)) ? Number(data.sdpMLineIndex) : null,
        }),
      );
    } catch {
    }
  }

  function bindChannelEvents(channel) {
    if (!channel) return;
    if (state.boundChannel === channel) return;
    state.boundChannel = channel;

    channel.on("voice:ready", (payload) => {
      const fromId = String(payload?.fromId ?? "");
      if (!fromId) return;
      const me = getMyId();
      if (!me || fromId === me) return;
      remoteReady.set(fromId, payload?.enabled !== false);

      if (!state.enabled) return;
      if (!remoteReady.get(fromId)) return;
      if (peers.has(fromId)) return;
      if (shouldInitiateOffer(fromId)) createAndSendOffer(fromId, channel);
    });

    channel.on("voice:hangup", (payload) => {
      const fromId = String(payload?.fromId ?? "");
      if (!fromId) return;
      closePeer(fromId, "voice:hangup");
    });

    channel.on("voice:signal", (payload) => {
      if (!state.enabled) return;
      const toId = String(payload?.toId ?? "");
      const me = getMyId();
      if (!me || !toId || toId !== me) return;
      const fromId = String(payload?.fromId ?? "");
      if (!fromId || fromId === me) return;
      const kind = String(payload?.kind ?? "");
      if (kind === "offer") handleOffer(fromId, channel, payload?.data);
      else if (kind === "answer") handleAnswer(fromId, channel, payload?.data);
      else if (kind === "ice") handleIce(fromId, channel, payload?.data);
    });

    channel.on("player:left", (payload) => {
      const id = String(payload?.playerId ?? payload?.player?.id ?? "");
      if (!id) return;
      closePeer(id, "voice:player-left");
      remoteReady.delete(id);
    });

    channel.onDisconnect?.(() => {
      closeAllPeers("voice:net-disconnect");
      remoteReady.clear();
      state.boundChannel = null;
    });
  }

  async function enable() {
    if (!multiplayerEnabled) {
      setStatus("Multiplayer فقط");
      return false;
    }
    if (!isSupported()) {
      setStatus("المتصفح لا يدعم WebRTC/Audio");
      return false;
    }

    const channel = ensureChannel?.();
    if (!channel) {
      setStatus("غير متصل بالشبكة");
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      state.localStream = stream;
      state.enabled = true;
      setMicMuted(state.micMuted);
      bindChannelEvents(channel);
      sendReady(channel);
      for (const id of Array.from(netState?.remotes?.keys?.() ?? [])) {
        if (remoteReady.get(id) && shouldInitiateOffer(id)) createAndSendOffer(id, channel);
      }
      setStatus("الصوت شغال");
      return true;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e ?? "mic permission error"));
      return false;
    }
  }

  function disable() {
    const channel = ensureChannel?.() ?? netState?.channel ?? null;
    state.enabled = false;
    closeAllPeers("voice:disabled");
    sendHangup(channel);
    try {
      for (const t of state.localStream?.getTracks?.() ?? []) t.stop();
    } catch {
    }
    state.localStream = null;
    setStatus("الصوت مقفول");
  }

  function update() {
    if (!multiplayerEnabled) return;
    if (!state.enabled) return;
    if (!netState?.joined || !getRoomId()) {
      closeAllPeers("voice:not-in-room");
      remoteReady.clear();
      state.lastReadyAtMs = 0;
      return;
    }
    const channel = ensureChannel?.() ?? netState?.channel ?? null;
    if (!channel) return;
    bindChannelEvents(channel);

    const nowMs = performance.now();
    if (nowMs - (state.lastReadyAtMs || 0) >= 12000) sendReady(channel);
  }

  function getState() {
    return {
      supported: isSupported(),
      enabled: state.enabled,
      micMuted: state.micMuted,
      status: state.status,
      peers: peers.size,
    };
  }

  return {
    enable,
    disable,
    update,
    setMicMuted,
    getState,
  };
}
