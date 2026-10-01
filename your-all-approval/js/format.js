// Formatting and escaping helpers (no DOM, no storage).
import { CONFIG } from './config.js';

/** Escape text before putting it into an HTML template string. */
export const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const initials = (name) => String(name || '?')
  .split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const ms = (iso) => Date.parse(iso);

/** Compact duration: "<1m", "42m", "5h 12m", "2d 3h" */
export function dur(millis) {
  const m = Math.max(0, Math.floor(millis / 60000));
  if (m < 1) return '<1m';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

// "2026-10-15" must be read as a local date, not UTC midnight
const toDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
};
const dtf = (options) => new Intl.DateTimeFormat(CONFIG.LOCALE, options);

export const fmtDateTime = (v) => dtf({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(toDate(v));
export const fmtShort = (v) => dtf({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(toDate(v));
export const fmtDate = (v) => dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(toDate(v));
export const fmtTime = (v) => dtf({ hour: '2-digit', minute: '2-digit' }).format(toDate(v));

export const fmtMoney = (n) => new Intl.NumberFormat(CONFIG.MONEY_LOCALE, {
  style: 'currency', currency: CONFIG.CURRENCY, maximumFractionDigits: 0,
}).format(n);
export const fmtNumber = (n) => new Intl.NumberFormat(CONFIG.MONEY_LOCALE, { maximumFractionDigits: 2 }).format(n);
export const fmtKB = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Today's date as "YYYY-MM-DD" in local time */
export function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
