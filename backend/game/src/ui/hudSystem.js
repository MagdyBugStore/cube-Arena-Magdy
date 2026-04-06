export function createHudSystem({ hudBoard, players, netState, multiplayerEnabled, getStats, getPlayerName } = {}) {
  const hudRows = [];

  function playerKey(p) {
    if (!p) return "";
    if (p.isRemote) return `r:${String(p.remoteId ?? "") || String(p.remoteNum ?? "") || String(p?.head?.mesh?.uuid ?? "")}`;
    return `l:${String(p?.head?.mesh?.uuid ?? "")}`;
  }

  function ensureHudRows(count) {
    if (!hudBoard) return;
    hudBoard.classList.add("glass-panel");
    const target = Math.max(0, Number(count) || 0);
    while (hudRows.length < target) {
      const row = document.createElement("div");
      row.className =
        "row flex items-center justify-between gap-3 bg-surface-container-low/40 border border-outline-variant/10 rounded-xl px-3 py-2";
      const rank = document.createElement("span");
      rank.className = "rank opacity-75 font-black tabular-nums";
      const name = document.createElement("span");
      name.className = "name flex-1 truncate font-bold";
      const score = document.createElement("span");
      score.className = "score tabular-nums font-black";
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
    const seen = new Set();
    for (const p of players ?? []) {
      const key = playerKey(p);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const s = getStats(p);
      const v = p.head.value ?? 0;
      if (v > s.lastHeadValue) s.score += v - s.lastHeadValue;
      s.lastHeadValue = v;
    }
  }

  function updateBoard() {
    if (!hudBoard) return;

    const merged = [];
    const seen = new Set();

    function add(p) {
      const key = playerKey(p);
      if (!key || seen.has(key)) return;
      if (!p?.head) return;
      seen.add(key);
      merged.push(p);
    }

    for (const p of players ?? []) add(p);
    if (multiplayerEnabled) {
      for (const e of netState?.remotes?.values?.() ?? []) add(e?.player);
    }

    const board = merged
      .map((p) => ({ p, kills: Number(getStats(p)?.kills) || 0, value: Number(p?.head?.value) || 0 }))
      .sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0) || (b.value ?? 0) - (a.value ?? 0));

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
      row.score.textContent = String(multiplayerEnabled ? (entry.kills ?? 0) : (entry.value ?? 0));
    }
  }

  function update() {
    updateScoreFromHeadValue();
    updateBoard();
  }

  return { update };
}
