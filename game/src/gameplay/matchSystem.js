import { formatTimeMMSS, computeWinnerByValue } from "./matchUtils.js";

export function createMatchSystem({
  env,
  player,
  bots,
  players,
  pressed,
  lobbyUi,
  netLeaveRoom,
  netRequestRoomsList,
  clearNetCubes,
  getStats,
  getPlayerName,
  respawnPlayer,
  multiplayerEnabled,
  testMode,
  matchDurationSec,
  elements,
  getMatchActive,
  setMatchActive,
  getMatchTotalPlayers,
  setMatchTotalPlayers,
  getMatchEndAtSec,
  setMatchEndAtSec,
  getMatchPendingEndAtSec,
  setMatchPendingEndAtSec,
  getMatchPendingWinner,
  setMatchPendingWinner,
  getMatchPendingReasonText,
  setMatchPendingReasonText,
  getPlayerJoined,
  setPlayerJoined,
  setSpectatorFocus,
} = {}) {
  const killFeed = [];

  function renderKillFeed() {
    const el = elements?.killFeedEl;
    if (!el) return;
    el.replaceChildren(
      ...killFeed.map((entry) => {
        const div = document.createElement("div");
        div.className = "killItem";
        div.textContent = entry.text;
        return div;
      }),
    );
  }

  function renderAliveCounter() {
    const target = elements?.hudMatchInfoEl ?? elements?.aliveCounterEl;
    if (!target) return;
    const total = getMatchTotalPlayers?.() ?? 0;
    if (!total) {
      target.textContent = "";
      return;
    }
    if (getMatchActive?.() && (getMatchEndAtSec?.() ?? 0) > 0) {
      const nowSec = performance.now() * 0.001;
      const left = Math.max(0, (getMatchEndAtSec?.() ?? 0) - nowSec);
      target.textContent = `المتبقي: ${players.length} / ${total} — الوقت: ${formatTimeMMSS(left)}`;
      return;
    }
    target.textContent = `المتبقي: ${players.length} / ${total}`;
  }

  function clearEndLeaderboard() {
    const el = elements?.endLeaderboardEl;
    if (!el) return;
    el.replaceChildren();
  }

  function getLeaderboardEntries() {
    const all = [player, ...(bots ?? [])];
    return all
      .filter((p) => p?.head)
      .map((p) => {
        const s = getStats(p);
        return {
          p,
          name: getPlayerName(p),
          value: p.head.value ?? 0,
          kills: s?.kills ?? 0,
          score: s?.score ?? 0,
          eliminated: Boolean(p.eliminated),
        };
      })
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || (b.kills ?? 0) - (a.kills ?? 0) || (b.score ?? 0) - (a.score ?? 0));
  }

  function renderEndLeaderboard(winner) {
    const el = elements?.endLeaderboardEl;
    if (!el) return;
    const total = getMatchTotalPlayers?.() ?? 0;
    if (!total) {
      clearEndLeaderboard();
      return;
    }

    const entries = getLeaderboardEntries();
    const title = document.createElement("div");
    title.className = "lbTitle";
    title.textContent = "لائحة الصدارة";

    const rows = entries.slice(0, 10).map((e, idx) => {
      const row = document.createElement("div");
      row.className = "lbRow";
      if (idx === 0) {
        row.style.background = "rgba(255, 215, 120, 0.14)";
        row.style.borderColor = "rgba(255, 215, 120, 0.25)";
        row.style.fontWeight = "950";
      }

      const left = document.createElement("div");
      left.className = "lbLeft";
      const winMark = e.p === winner ? " (الفائز)" : "";
      const outMark = e.eliminated ? " (خرج)" : "";
      left.textContent = `${idx + 1}) ${e.name}${winMark}${outMark}`;
      if (idx === 0) {
        left.style.fontFamily = `"Arial Black", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
        left.style.letterSpacing = "0.2px";
      }

      const right = document.createElement("div");
      right.className = "lbRight";
      right.textContent = `${e.value} • قتلات: ${e.kills}`;
      if (idx === 0) {
        right.style.fontFamily = `"Arial Black", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      }

      row.append(left, right);
      return row;
    });

    el.replaceChildren(title, ...rows);
  }

  function setPaused(paused) {
    env.setPaused(paused);
  }

  function showEndOverlay({ winner, reasonText = "" } = {}) {
    if (elements?.startTitle) elements.startTitle.textContent = "انتهت المباراة";
    const winnerText = `الفائز: ${getPlayerName(winner)}`;
    lobbyUi.setStartHintText(reasonText ? `${reasonText} — ${winnerText}` : winnerText);
    renderEndLeaderboard(winner);
    netLeaveRoom();
    setPaused(true);
    const hasName = Boolean(elements?.loadUserName?.());
    lobbyUi.setStepVisible(hasName && multiplayerEnabled ? "rooms" : "name");
    lobbyUi.updateStartGateUI();
    lobbyUi.showStartOverlay();
    if (multiplayerEnabled) netRequestRoomsList();
  }

  function showDeathOverlay({ killer } = {}) {
    if (elements?.startTitle) elements.startTitle.textContent = "لقد خسرت";
    const killerName = killer ? getPlayerName(killer) : "";
    lobbyUi.setStartHintText(killerName ? `قتلك: ${killerName}` : "تمت إزالتك");
    clearEndLeaderboard();
    netLeaveRoom();
    setPaused(true);
    const hasName = Boolean(elements?.loadUserName?.());
    lobbyUi.setStepVisible(hasName && multiplayerEnabled ? "rooms" : "name");
    lobbyUi.updateStartGateUI();
    lobbyUi.showStartOverlay();
    if (multiplayerEnabled) netRequestRoomsList();
  }

  function endMatch({ winner, reasonText = "" } = {}) {
    if (!winner || !getMatchActive?.()) return;
    setMatchActive(false);
    setMatchEndAtSec(0);
    setMatchPendingEndAtSec(0);
    setMatchPendingWinner(null);
    setMatchPendingReasonText("");

    setSpectatorFocus(winner ?? null);
    setPlayerJoined(false);
    pressed.clear();
    if (env.updatables?.delete) env.updatables.delete(player);
    setPaused(true);
    showEndOverlay({ winner, reasonText });
  }

  function endMatchByTime() {
    if (!getMatchActive?.()) return;
    const winner = computeWinnerByValue(players);
    if (!winner) return;
    endMatch({ winner, reasonText: "انتهى الوقت" });
  }

  function resetMatchWorld() {
    setMatchActive(true);
    setSpectatorFocus(null);
    setMatchTotalPlayers(multiplayerEnabled ? 0 : (bots?.length ?? 0) + 1);
    killFeed.length = 0;
    setMatchEndAtSec(performance.now() * 0.001 + Number(matchDurationSec || 0));
    setMatchPendingEndAtSec(0);
    setMatchPendingWinner(null);
    setMatchPendingReasonText("");

    players.length = 0;
    if (!multiplayerEnabled) {
      for (const bot of bots ?? []) {
        bot.eliminated = false;
        if (bot.head?.mesh) bot.head.mesh.visible = true;
        respawnPlayer(bot, { avoid: players });
        env.addUpdatable(bot);
        players.push(bot);
      }
    }

    const pIdx = players.indexOf(player);
    if (pIdx >= 0) players.splice(pIdx, 1);
    if (env.updatables?.delete) env.updatables.delete(player);
    if (typeof player.clearTail === "function") player.clearTail();
    if (player.head?.mesh) player.head.mesh.visible = false;
    player.eliminated = false;
    setPlayerJoined(false);
    pressed.clear();

    clearNetCubes();
    renderAliveCounter();
    renderKillFeed();
    clearEndLeaderboard();
  }

  function addKillNotification(killer, victim) {
    if (!getMatchActive?.() || !getMatchTotalPlayers?.()) return;
    const killerName = getPlayerName(killer);
    const victimName = getPlayerName(victim);
    const nowSec = performance.now() * 0.001;
    killFeed.unshift({ text: `${killerName} قتل ${victimName}`, expiresAtSec: nowSec + 4.5 });
    if (killFeed.length > 6) killFeed.length = 6;
    renderKillFeed();
  }

  function eliminateFromMatch(victim, killer) {
    if (!victim) return;

    const idx = players.indexOf(victim);
    if (idx >= 0) players.splice(idx, 1);
    if (env.updatables?.delete) env.updatables.delete(victim);

    if (typeof elements?.dropTailFromIndex === "function") elements.dropTailFromIndex(victim, 0);
    if (typeof victim.clearTail === "function") victim.clearTail();
    if (victim.head?.mesh) victim.head.mesh.visible = false;

    victim.eliminated = true;

    if (victim === player) {
      setPlayerJoined(false);
      setSpectatorFocus(killer ?? null);
      pressed.clear();
      if (!testMode) showDeathOverlay({ killer });
    }

    renderAliveCounter();

    if (!getMatchActive?.()) return;
    if (players.length !== 1) return;
    const winner = players[0];
    const nowSec = performance.now() * 0.001;
    if ((getMatchPendingEndAtSec?.() ?? 0) > 0) return;
    setMatchPendingWinner(winner ?? null);
    setMatchPendingReasonText("آخر لاعب");
    setMatchPendingEndAtSec(nowSec + 3);
  }

  function tick() {
    renderAliveCounter();
    const nowSec = performance.now() * 0.001;

    if (getMatchActive?.() && (getMatchPendingEndAtSec?.() ?? 0) > 0 && nowSec >= (getMatchPendingEndAtSec?.() ?? 0)) {
      const winner = getMatchPendingWinner?.() ?? players?.[0] ?? null;
      const reasonText = getMatchPendingReasonText?.() || "آخر لاعب";
      setMatchPendingEndAtSec(0);
      setMatchPendingWinner(null);
      setMatchPendingReasonText("");
      if (winner) endMatch({ winner, reasonText });
      return;
    }

    if (getMatchActive?.() && (getMatchEndAtSec?.() ?? 0) > 0 && nowSec >= (getMatchEndAtSec?.() ?? 0)) {
      endMatchByTime();
      return;
    }

    if (killFeed.length === 0) return;
    let changed = false;
    for (let i = killFeed.length - 1; i >= 0; i -= 1) {
      if (nowSec >= (killFeed[i]?.expiresAtSec ?? 0)) {
        killFeed.splice(i, 1);
        changed = true;
      }
    }
    if (changed) renderKillFeed();
  }

  return {
    tick,
    resetMatchWorld,
    endMatchByTime,
    endMatch,
    eliminateFromMatch,
    addKillNotification,
    renderAliveCounter,
    renderKillFeed,
    clearEndLeaderboard,
    renderEndLeaderboard,
    setPaused,
    showEndOverlay,
    showDeathOverlay,
  };
}

