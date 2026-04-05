export function getPlayerName(p) {
  const n = p?.head?.name ?? "";
  return n ? String(n) : "Player";
}

