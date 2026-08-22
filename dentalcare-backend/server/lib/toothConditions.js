const TOOTH_CONDITIONS = [
  { code: 'HEALTHY', category: 'base' },
  { code: 'MISSING', category: 'structure' },
  { code: 'FRACTURE', category: 'structure' },
  { code: 'CARIES', category: 'disease' },
  { code: 'FILLING', category: 'restorative' },
  { code: 'CROWN', category: 'restorative' },
  { code: 'VENEER', category: 'restorative' },
  { code: 'BRIDGE', category: 'restorative' },
  { code: 'ROOT_CANAL', category: 'endo' },
  { code: 'EXTRACTION', category: 'surg' },
  { code: 'IMPLANT', category: 'surg' },
];

const VALID_CODES = new Set(TOOTH_CONDITIONS.map((c) => c.code));

const CATALOG_DEFAULT_CODES = {
  'كشف': null,
  'تنظيف أسنان': null,
  'حشوة بيضاء': 'FILLING',
  'حشوة عادية': 'FILLING',
  'علاج عصب': 'ROOT_CANAL',
  'خلع بسيط': 'EXTRACTION',
  'خلع جراحي': 'EXTRACTION',
  'تاج': 'CROWN',
  'زراعة': 'IMPLANT',
  'أشعة': null,
};

function normalizeConditionCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  return VALID_CODES.has(raw) ? raw : null;
}

function inferConditionFromTreatmentName(name) {
  const n = String(name || '').toLowerCase();
  if (/تاج|crown/.test(n)) return 'CROWN';
  if (/فينير|veneer|لامينيت/.test(n)) return 'VENEER';
  if (/زراع|implant/.test(n)) return 'IMPLANT';
  if (/خلع|extract/.test(n)) return 'EXTRACTION';
  if (/عصب|root.?canal|endodont/.test(n)) return 'ROOT_CANAL';
  if (/حشو|filling|composite|white/.test(n)) return 'FILLING';
  if (/تسوس|caries|decay/.test(n)) return 'CARIES';
  if (/كسر|fracture/.test(n)) return 'FRACTURE';
  if (/bridge|جسر/.test(n)) return 'BRIDGE';
  if (/كشف|exam|clean|تنظيف|أشعة|x-?ray/.test(n)) return null;
  return 'FILLING';
}

function normalizeToothFdi(value) {
  const raw = String(value || '').trim();
  return /^\d{2}$/.test(raw) ? raw : null;
}

module.exports = {
  TOOTH_CONDITIONS,
  VALID_CODES,
  CATALOG_DEFAULT_CODES,
  normalizeConditionCode,
  inferConditionFromTreatmentName,
  normalizeToothFdi,
};
