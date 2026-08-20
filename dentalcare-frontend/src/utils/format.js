export function formatMoney(value, settings) {
  const n = Number(value);
  const amount = Number.isFinite(n) ? n : 0;
  const places = Number(settings?.decimalPlaces ?? 2);
  const [intPart, decPart] = amount.toFixed(places).split('.');
  const grouped = settings?.thousandsSeparator
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousandsSeparator)
    : intPart;
  const formatted = decPart != null
    ? `${grouped}${settings?.decimalSeparator || '.'}${decPart}`
    : grouped;
  const symbol = settings?.currencySymbol || '';
  return symbol ? `${formatted} ${symbol}` : formatted;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoParts(y, m, d) {
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function formatDate(value, settings) {
  if (!value) return '';
  const raw = typeof value === 'string' ? value.slice(0, 10) : '';
  let y;
  let m;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [y, m, d] = raw.split('-');
  } else {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    y = String(date.getFullYear());
    m = pad2(date.getMonth() + 1);
    d = pad2(date.getDate());
  }
  const fmt = settings?.dateFormat || 'DD/MM/YYYY';
  if (fmt === 'YYYY-MM-DD') return `${y}-${m}-${d}`;
  if (fmt === 'DD-MM-YYYY') return `${d}-${m}-${y}`;
  if (fmt === 'MM/DD/YYYY') return `${m}/${d}/${y}`;
  return `${d}/${m}/${y}`;
}

/** Parse a display-formatted date (or ISO) into YYYY-MM-DD. */
export function parseDateInput(text, settings) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return toIsoParts(...raw.split('-')) || '';

  const fmt = settings?.dateFormat || 'DD/MM/YYYY';
  let match;
  if (fmt === 'YYYY-MM-DD') {
    match = raw.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (!match) return '';
    return toIsoParts(match[1], match[2], match[3]) || '';
  }
  if (fmt === 'MM/DD/YYYY') {
    match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!match) return '';
    return toIsoParts(match[3], match[1], match[2]) || '';
  }
  // DD/MM/YYYY or DD-MM-YYYY
  match = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!match) return '';
  return toIsoParts(match[3], match[2], match[1]) || '';
}
