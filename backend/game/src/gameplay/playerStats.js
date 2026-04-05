export function createPlayerStatsStore() {
  const statsByPlayer = new Map();

  function getStats(p) {
    let s = statsByPlayer.get(p);
    if (s) return s;
    s = { score: 0, kills: 0, lastHeadValue: p?.head?.value ?? 0 };
    statsByPlayer.set(p, s);
    return s;
  }

  return { getStats };
}

