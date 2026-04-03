export function createHudSystem({ hudBoard, players, netState, multiplayerEnabled, getStats, getPlayerName } = {}) {
  const hudRows = [];

  function ensureHudRows(count) {
    if (!hudBoard) return;
    const target = Math.max(0, Number(count) || 0);
    while (hudRows.length < target) {
      const row = document.createElement("div");
      row.className = "row";
      const rank = document.createElement("span");
      rank.className = "rank";
      const name = document.createElement("span");
      name.className = "name";
      const score = document.createElement("span");
      score.className = "score";
      row.append(rank, name, score);
      hudBoard.append(row);
      hudRows.push({ row, rank, name, score });
    }
    while (hudRows.length > target) {
      const last = hudRows.pop();
      if (last?.row?.parentNode) last.row.parentNode.removeChild(last.row);
    }
  }

  function updateScoreFromHeadValue() {
    for (const p of players ?? []) {
      const s = getStats(p);
      const v = p.head.value ?? 0;
      if (v > s.lastHeadValue) s.score += v - s.lastHeadValue;
      s.lastHeadValue = v;
    }
  }

  function updateBoard() {
    if (!hudBoard) return;

    const remotes = multiplayerEnabled ? Array.from(netState?.remotes?.values?.() ?? []).map((e) => e.player) : [];
    const allPlayers = remotes.length > 0 ? (players ?? []).concat(remotes) : players ?? [];
    const board = allPlayers
      .filter((p) => p?.head)
      .map((p) => ({ p }))
      .sort((a, b) => (b.p.head.value ?? 0) - (a.p.head.value ?? 0));

    ensureHudRows(board.length);

    for (let i = 0; i < hudRows.length; i += 1) {
      const row = hudRows[i];
      const entry = board[i];
      if (!entry) {
        row.rank.textContent = "";
        row.name.textContent = "";
        row.score.textContent = "";
        continue;
      }
      row.rank.textContent = String(i + 1);
      row.name.textContent = getPlayerName(entry.p);
      row.score.textContent = String(entry.p.head.value ?? 0);
    }
  }

  function update() {
    updateScoreFromHeadValue();
    updateBoard();
  }

  return { update };
}

