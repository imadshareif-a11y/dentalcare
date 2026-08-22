const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const WESTERN_DIGITS = '0123456789';

/** تحويل أي أرقام هندية/فارسية إلى إنجليزية (للتخزين والإدخال) */
export function toWesternDigits(value) {
  return String(value ?? '')
    .replace(/[\u0660-\u0669]/g, (ch) => WESTERN_DIGITS[ch.charCodeAt(0) - 0x0660])
    .replace(/[\u06F0-\u06F9]/g, (ch) => WESTERN_DIGITS[ch.charCodeAt(0) - 0x06F0]);
}

/** تحويل الأرقام الإنجليزية إلى هندية شرقية للعرض */
export function toEasternDigits(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => EASTERN_DIGITS[Number(d)]);
}

export function applyNumberDigits(value, settings) {
  const mode = settings?.numberDigits || 'western';
  const western = toWesternDigits(value);
  if (mode === 'eastern') return toEasternDigits(western);
  return western;
}

/** رمز العملة المعتمد للعيادة (إعدادات أو عملة الأساس) */
export function resolveCurrencySymbol(settings) {
  const fromSettings = String(settings?.currencySymbol || '').trim();
  if (fromSettings) return fromSettings;
  const fromBase = String(settings?.baseCurrencySymbol || '').trim();
  if (fromBase) return fromBase;
  const code = String(settings?.baseCurrencyCode || '').trim();
  if (code) return code;
  return '₪';
}

export function formatMoney(value, settings) {
  const n = Number(toWesternDigits(value));
  const amount = Number.isFinite(n) ? n : 0;
  const places = Number(settings?.decimalPlaces ?? 2);
  const [intPart, decPart] = amount.toFixed(places).split('.');
  const grouped = settings?.thousandsSeparator
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousandsSeparator)
    : intPart;
  const formatted = decPart != null
    ? `${grouped}${settings?.decimalSeparator || '.'}${decPart}`
    : grouped;
  const withDigits = applyNumberDigits(formatted, settings);
  const symbol = resolveCurrencySymbol(settings);
  return `${withDigits} ${symbol}`;
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
  // خذ YYYY-MM-DD من أي ISO بدون تحويل منطقة زمنية يغيّر اليوم
  const asString = typeof value === 'string'
    ? value
    : (value instanceof Date && !Number.isNaN(value.getTime())
      ? `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`
      : String(value));
  const raw = toWesternDigits(asString).slice(0, 10);
  let y;
  let m;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    [y, m, d] = raw.split('-');
  } else {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return applyNumberDigits(String(value), settings);
    y = String(date.getFullYear());
    m = pad2(date.getMonth() + 1);
    d = pad2(date.getDate());
  }
  const fmt = settings?.dateFormat || 'DD/MM/YYYY';
  let out;
  if (fmt === 'YYYY-MM-DD') out = `${y}-${m}-${d}`;
  else if (fmt === 'DD-MM-YYYY') out = `${d}-${m}-${y}`;
  else if (fmt === 'MM/DD/YYYY') out = `${m}/${d}/${y}`;
  else out = `${d}/${m}/${y}`;
  return applyNumberDigits(out, settings);
}

const TIME_PERIOD_LABELS = {
  ar: { am: 'AM', pm: 'PM' },
  en: { am: 'AM', pm: 'PM' },
  he: { am: 'AM', pm: 'PM' },
};

export function periodLabelsForLocale(locale = 'ar') {
  const key = String(locale || 'ar').slice(0, 2).toLowerCase();
  return TIME_PERIOD_LABELS[key] || TIME_PERIOD_LABELS.en;
}

/** استخراج HH:mm من قيمة وقت (slot أو ISO) */
export function parseTimeToHm(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  const raw = toWesternDigits(String(value)).trim();
  const hm = raw.match(/(?:^|[T\s])(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return `${pad2(h)}:${pad2(m)}`;
  }
  if (/^\d{2}:\d{2}$/.test(raw)) return raw;
  return null;
}

/**
 * عرض الوقت حسب إعداد العيادة (12h افتراضي / 24h).
 * التخزين يبقى دائماً HH:mm بنظام 24 ساعة.
 */
export function formatTime(value, settings, locale = 'ar') {
  const hm = parseTimeToHm(value);
  if (!hm) return value ? applyNumberDigits(String(value), settings) : '';
  const [hStr, mStr] = hm.split(':');
  const hour24 = Number(hStr);
  const minute = mStr;
  if (settings?.timeFormat === '24h') {
    return applyNumberDigits(`${pad2(hour24)}:${minute}`, settings);
  }
  const period = hour24 >= 12 ? 'pm' : 'am';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const labels = periodLabelsForLocale(locale);
  const suffix = period === 'am' ? labels.am : labels.pm;
  return `${applyNumberDigits(`${hour12}:${minute}`, settings)} ${suffix}`;
}

export function formatTimeRange(start, end, settings, locale = 'ar') {
  const a = parseTimeToHm(start);
  const b = parseTimeToHm(end ?? start) || a;
  if (!a) return '';
  if (!b || a === b) return formatTime(a, settings, locale);
  if (settings?.timeFormat === '24h') {
    return `${formatTime(a, settings, locale)}–${formatTime(b, settings, locale)}`;
  }
  const [hA] = a.split(':').map(Number);
  const [hB] = b.split(':').map(Number);
  const periodA = hA >= 12 ? 'pm' : 'am';
  const periodB = hB >= 12 ? 'pm' : 'am';
  const labels = periodLabelsForLocale(locale);
  const toClock = (hm) => {
    const [hStr, mStr] = hm.split(':');
    let hour12 = Number(hStr) % 12;
    if (hour12 === 0) hour12 = 12;
    return applyNumberDigits(`${hour12}:${mStr}`, settings);
  };
  if (periodA === periodB) {
    const suffix = periodA === 'am' ? labels.am : labels.pm;
    return `${toClock(a)}–${toClock(b)} ${suffix}`;
  }
  return `${formatTime(a, settings, locale)}–${formatTime(b, settings, locale)}`;
}

export function formatDateTime(value, settings, locale = 'ar') {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return applyNumberDigits(String(value), settings);
  const datePart = formatDate(d, settings);
  const timePart = formatTime(d, settings, locale);
  return `${datePart} ${timePart}`.trim();
}

/** Parse a display-formatted date (or ISO) into YYYY-MM-DD. */
export function parseDateInput(text, settings) {
  const raw = toWesternDigits(String(text || '').trim());
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

function syncNumericInputLocale(el, mode) {
  if (!(el instanceof HTMLInputElement)) return;
  const isNumeric = el.type === 'number'
    || el.type === 'tel'
    || el.inputMode === 'decimal'
    || el.inputMode === 'numeric';
  if (!isNumeric) return;
  if (mode === 'western') {
    el.setAttribute('lang', 'en');
    el.style.setProperty('-webkit-locale', '"en"');
  } else {
    el.setAttribute('lang', 'ar');
    el.style.setProperty('-webkit-locale', '"ar"');
  }
}

/** تطبيق ترميز الأرقام على المستند وحقول الأرقام (لا يتبع إعدادات الجهاز) */
export function applyNumberDigitsToDocument(numberDigits = 'western') {
  const mode = numberDigits === 'eastern' ? 'eastern' : 'western';
  const root = document.documentElement;
  root.setAttribute('data-number-digits', mode);
  if (mode === 'western') {
    root.style.setProperty('-webkit-locale', '"en"');
  } else {
    root.style.setProperty('-webkit-locale', '"ar"');
  }
  document.querySelectorAll('input').forEach((el) => syncNumericInputLocale(el, mode));
}

/** يراقب الحقول الجديدة ويفرض لغة الأرقام عليها */
export function observeNumberDigitInputs(numberDigits = 'western') {
  const mode = numberDigits === 'eastern' ? 'eastern' : 'western';
  applyNumberDigitsToDocument(mode);
  const target = document.getElementById('root') || document.body;
  if (!target || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('input')) syncNumericInputLocale(node, mode);
        node.querySelectorAll?.('input').forEach((el) => syncNumericInputLocale(el, mode));
      }
    }
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => observer.disconnect();
}
