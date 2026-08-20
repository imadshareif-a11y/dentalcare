const STORAGE_KEY = 'dc.reportPeriod';

function pad(n) {
  return String(n).padStart(2, '0');
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function monthRange(year, month) {
  const last = new Date(year, month, 0).getDate();
  return {
    fromDate: `${year}-${pad(month)}-01`,
    toDate: `${year}-${pad(month)}-${pad(last)}`,
  };
}

export function rangeFromPreset(preset) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = todayIso();

  const fyMatch = /^fy(\d{4})$/.exec(preset || '');
  if (fyMatch) {
    const y = Number(fyMatch[1]);
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
  }
  if (preset === 'year') {
    return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
  }
  if (preset === 'prev_year') {
    const y = year - 1;
    return { fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
  }
  if (preset === 'month') {
    return monthRange(year, month);
  }
  if (preset === 'today') {
    return { fromDate: today, toDate: today };
  }
  if (preset === 'yesterday') {
    const y = addDays(today, -1);
    return { fromDate: y, toDate: y };
  }
  const monthMatch = /^m(\d{1,2})$/.exec(preset);
  if (monthMatch) {
    const n = Number(monthMatch[1]);
    if (n >= 1 && n <= 12) return monthRange(year, n);
  }
  return { fromDate: today, toDate: today };
}

export function loadReportPeriod() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (raw?.fromDate && raw?.toDate) {
      return {
        fromDate: raw.fromDate,
        toDate: raw.toDate,
        preset: raw.preset || 'custom',
      };
    }
  } catch {
    /* ignore */
  }
  return { ...rangeFromPreset('today'), preset: 'today' };
}

export function saveReportPeriod(period) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
  } catch {
    /* ignore */
  }
}
