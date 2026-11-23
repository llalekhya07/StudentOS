// js/utils.js - shared helpers: escaping, ids, dates, formatting, CSV, downloads.
//
// DATE RULE: dates are stored as "YYYY-MM-DD" strings and times as "HH:MM" strings,
// never as Date objects. ISO strings sort correctly with plain < and >, survive JSON/IndexedDB,
// and avoid timezone off-by-one bugs (new Date("2026-01-05") is parsed as UTC, not local time).

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Escape user text before putting it in an HTML string (prevents XSS). */
export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d); // local time
}
export const todayISO = () => toISO(new Date());
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export const weekdayOf = (iso) => parseISO(iso).getDay(); // 0 = Sunday
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export function* eachDate(start, end) {
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) yield cur;
}
export function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
}
export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);
/** Monday of the week containing iso. */
export const startOfWeek = (iso) => addDays(iso, -((weekdayOf(iso) + 6) % 7));
export const timeToMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/* ---------- formatting ---------- */
export function formatDate(iso) {
  if (!iso) return '-';
  return parseISO(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const formatTime = (t) => t || '';
export function fmtPct(n, digits = 1) {
  return n === null || n === undefined || Number.isNaN(n) ? '-' : `${Number(n.toFixed(digits))}%`;
}
export function fmtNum(n, digits = 2) {
  return n === null || n === undefined || Number.isNaN(n) ? '-' : String(Number(n.toFixed(digits)));
}

/* ---------- CSV + downloads ---------- */
export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}
export const toCSV = (rows) => rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');

export function downloadText(filename, text, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- binary <-> base64 (used by the full backup that includes attached files) ---------- */
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
export function base64ToBlob(b64, type = 'application/octet-stream') {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
