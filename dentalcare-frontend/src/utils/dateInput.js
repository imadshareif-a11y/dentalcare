import { applyNumberDigits, formatDate, parseDateInput, toWesternDigits } from './format';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function extractDateDigits(text) {
  return toWesternDigits(String(text || '')).replace(/\D/g, '').slice(0, 8);
}

function separatorForFormat(fmt) {
  if (fmt === 'YYYY-MM-DD') return '-';
  if (fmt === 'DD-MM-YYYY') return '-';
  return '/';
}

/** يبني نص التاريخ من الأرقام فقط مع فواصل تلقائية (بدون ذكاء المقاطع) */
export function formatDateFromDigits(digits, fmt = 'DD/MM/YYYY') {
  const d = String(digits || '').slice(0, 8);
  if (!d) return '';

  const sep = separatorForFormat(fmt);

  if (fmt === 'YYYY-MM-DD') {
    let out = d.slice(0, 4);
    if (d.length > 4) out += sep + d.slice(4, 6);
    if (d.length > 6) out += sep + d.slice(6, 8);
    return out;
  }

  if (fmt === 'MM/DD/YYYY') {
    let out = d.slice(0, 2);
    if (d.length > 2) out += sep + d.slice(2, 4);
    if (d.length > 4) out += sep + d.slice(4, 8);
    return out;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  let out = d.slice(0, 2);
  if (d.length > 2) out += sep + d.slice(2, 4);
  if (d.length > 4) out += sep + d.slice(4, 8);
  return out;
}

function parseDaySegment(digits, idx) {
  if (idx >= digits.length) {
    return { value: '', next: idx, complete: false, autoPadded: false };
  }

  const d1 = digits[idx];
  if (idx + 1 >= digits.length) {
    if (Number(d1) > 3) {
      return { value: pad2(Number(d1)), next: idx + 1, complete: true, autoPadded: true };
    }
    return { value: d1, next: idx + 1, complete: false, autoPadded: false };
  }

  const d2 = digits[idx + 1];
  if (Number(d1) > 3) {
    return { value: pad2(Number(d1)), next: idx + 1, complete: true, autoPadded: true };
  }

  const two = Number(d1 + d2);
  if (two >= 1 && two <= 31) {
    return { value: pad2(two), next: idx + 2, complete: true, autoPadded: false };
  }

  return { value: '31', next: idx + 2, complete: true, autoPadded: false };
}

function parseMonthSegment(digits, idx) {
  if (idx >= digits.length) {
    return { value: '', next: idx, complete: false, autoPadded: false };
  }

  const m1 = digits[idx];
  if (idx + 1 >= digits.length) {
    if (Number(m1) > 1) {
      return { value: pad2(Number(m1)), next: idx + 1, complete: true, autoPadded: true };
    }
    return { value: m1, next: idx + 1, complete: false, autoPadded: false };
  }

  const m2 = digits[idx + 1];
  if (Number(m1) > 1) {
    return { value: pad2(Number(m1)), next: idx + 1, complete: true, autoPadded: true };
  }

  const two = Number(m1 + m2);
  if (two >= 1 && two <= 12) {
    return { value: pad2(two), next: idx + 2, complete: true, autoPadded: false };
  }

  return { value: '12', next: idx + 2, complete: true, autoPadded: false };
}

function shouldShowSepAfter(part, { complete, autoPadded, hasNext, isDeleting }) {
  if (!complete) return false;
  if (autoPadded) return true;
  if (hasNext) return true;
  return !isDeleting;
}

function buildSmartDisplay(parts, sep, isDeleting) {
  let display = '';
  let cursor = 0;

  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!part.value) break;

    display += part.value;
    cursor = display.length;

    const hasNext = Boolean(parts[i + 1]?.value);
    if (shouldShowSepAfter(part, { ...part, hasNext, isDeleting })) {
      display += sep;
      cursor = display.length;
    }
  }

  return { display, cursor };
}

function smartFromOrder(digits, order, sep, isDeleting) {
  let idx = 0;
  const parts = [];

  for (const kind of order) {
    if (kind === 'day' || kind === 'month') {
      const parsed = kind === 'day'
        ? parseDaySegment(digits, idx)
        : parseMonthSegment(digits, idx);
      parts.push(parsed);
      idx = parsed.next;
      if (!parsed.complete) break;
      continue;
    }

    if (kind === 'year') {
      const value = digits.slice(idx, idx + Math.min(4, digits.length - idx));
      const parsed = {
        value,
        next: idx + value.length,
        complete: value.length === 4,
        autoPadded: false,
      };
      parts.push(parsed);
      idx = parsed.next;
      if (!parsed.complete) break;
    }
  }

  return buildSmartDisplay(parts, sep, isDeleting);
}

/**
 * قناع ذكي: يكمّل اليوم/الشهر تلقائياً وينتقل للمقطع التالي.
 * @returns {{ display: string, cursor: number }}
 */
export function smartFormatDateDigits(rawDigits, fmt = 'DD/MM/YYYY', options = {}) {
  const digits = String(rawDigits || '').replace(/\D/g, '').slice(0, 8);
  const isDeleting = Boolean(options.isDeleting);
  const sep = separatorForFormat(fmt);

  if (!digits) {
    return { display: '', cursor: 0 };
  }

  if (fmt === 'YYYY-MM-DD') {
    return smartFromOrder(digits, ['year', 'month', 'day'], sep, isDeleting);
  }
  if (fmt === 'MM/DD/YYYY') {
    return smartFromOrder(digits, ['month', 'day', 'year'], sep, isDeleting);
  }
  return smartFromOrder(digits, ['day', 'month', 'year'], sep, isDeleting);
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

function resolveTwoDigitYear(yy, { min, max } = {}) {
  const n = Number(yy);
  if (!Number.isFinite(n)) return null;
  const candidates = [2000 + n, 1900 + n];
  const ref = new Date().getFullYear();

  const scored = candidates.map((year) => {
    let score = Math.abs(year - ref);
    if (min && `${year}-12-31` < min.slice(0, 4)) score += 1000;
    if (max && `${year}-01-01` > max.slice(0, 4)) score += 1000;
    return { year, score };
  }).sort((a, b) => a.score - b.score);

  return scored[0]?.year ?? (2000 + n);
}

function parseDigitsToIso(digits, fmt, options = {}) {
  const d = String(digits || '');
  if (!d) return '';

  if (d.length === 8) {
    if (fmt === 'YYYY-MM-DD') {
      return toIsoParts(d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)) || '';
    }
    if (fmt === 'MM/DD/YYYY') {
      return toIsoParts(d.slice(4, 8), d.slice(0, 2), d.slice(2, 4)) || '';
    }
    return toIsoParts(d.slice(4, 8), d.slice(2, 4), d.slice(0, 2)) || '';
  }

  if (d.length === 6) {
    const year = resolveTwoDigitYear(d.slice(4, 6), options);
    if (fmt === 'YYYY-MM-DD') {
      const y = resolveTwoDigitYear(d.slice(0, 2), options);
      return toIsoParts(y, d.slice(2, 4), d.slice(4, 6)) || '';
    }
    if (fmt === 'MM/DD/YYYY') {
      return toIsoParts(year, d.slice(0, 2), d.slice(2, 4)) || '';
    }
    return toIsoParts(year, d.slice(2, 4), d.slice(0, 2)) || '';
  }

  if (d.length === 4 && options.completeOnBlur) {
    const year = options.defaultYear ?? new Date().getFullYear();
    if (fmt === 'MM/DD/YYYY') {
      return toIsoParts(year, d.slice(0, 2), d.slice(2, 4)) || '';
    }
    if (fmt !== 'YYYY-MM-DD') {
      return toIsoParts(year, d.slice(2, 4), d.slice(0, 2)) || '';
    }
  }

  return '';
}

/** تحليل ذكي: صيغة العرض، ISO، أو أرقام متصلة */
export function parseDateInputSmart(text, settings, options = {}) {
  const fromDisplay = parseDateInput(text, settings);
  if (fromDisplay) return fromDisplay;

  const fmt = settings?.dateFormat || 'DD/MM/YYYY';
  const digits = extractDateDigits(text);
  return parseDigitsToIso(digits, fmt, options);
}

export function clampIsoDate(iso, min, max) {
  if (!iso) return iso;
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export function addDaysToIso(iso, delta) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/**
 * @returns {{ display: string, iso: string, status: 'empty'|'partial'|'valid'|'invalid', cursor: number }}
 */
export function normalizeDateTyping(raw, settings, options = {}) {
  const fmt = settings?.dateFormat || 'DD/MM/YYYY';
  const trimmed = toWesternDigits(String(raw || '')).trim();

  if (!trimmed) {
    return { display: '', iso: '', status: 'empty', cursor: 0 };
  }

  const fromFormatted = parseDateInput(trimmed, settings);
  if (fromFormatted) {
    const display = formatDate(fromFormatted, settings);
    return {
      display,
      iso: fromFormatted,
      status: 'valid',
      cursor: display.length,
    };
  }

  const digits = extractDateDigits(trimmed);
  const { display: maskedWestern, cursor } = smartFormatDateDigits(digits, fmt, {
    isDeleting: options.isDeleting,
  });
  const display = applyNumberDigits(maskedWestern, settings);
  const iso = parseDigitsToIso(digits, fmt, options)
    || parseDateInput(maskedWestern, settings)
    || '';

  const cursorOut = Math.min(cursor, display.length);

  if (iso) {
    return { display, iso, status: 'valid', cursor: cursorOut };
  }

  if (digits.length >= 8 || (options.completeOnBlur && digits.length >= 4)) {
    const blurIso = parseDateInputSmart(maskedWestern, settings, { ...options, completeOnBlur: true });
    if (blurIso) {
      return { display, iso: blurIso, status: 'valid', cursor: cursorOut };
    }
    return { display, iso: '', status: 'invalid', cursor: cursorOut };
  }

  return {
    display,
    iso: '',
    status: digits.length ? 'partial' : 'empty',
    cursor: cursorOut,
  };
}
