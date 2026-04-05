export function normalizeUserName(value) {
  const raw = String(value ?? "");
  const cleaned = raw.replace(/\s+/g, " ").replace(/[\r\n\t]/g, " ").trim();
  return cleaned.slice(0, 18);
}

export function loadUserName() {
  try {
    return normalizeUserName(localStorage.getItem("username"));
  } catch {
    return "";
  }
}

export function saveUserName(name) {
  const next = normalizeUserName(name);
  try {
    localStorage.setItem("username", next);
  } catch {
  }
  return next;
}

