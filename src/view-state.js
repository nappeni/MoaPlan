// Only navigation identifiers are retained for this browser tab; no settings or secrets.
const prefix = 'moaplan:view:';
export function readView(key, fallback = null) {
  try { return JSON.parse(sessionStorage.getItem(prefix + key)) ?? fallback; }
  catch { return fallback; }
}
export function writeView(key, value) {
  try { sessionStorage.setItem(prefix + key, JSON.stringify(value)); } catch {}
}
export function clearView() {
  for (const key of ['page','activity','venue','settingsTab','promotion']) {
    try { sessionStorage.removeItem(prefix + key); } catch {}
  }
}
