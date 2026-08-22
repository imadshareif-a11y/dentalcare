export const TOOTH_CONDITIONS = [
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

const LABEL_KEYS = {
  HEALTHY: 'tooth_cond_healthy',
  MISSING: 'tooth_cond_missing',
  FRACTURE: 'tooth_cond_fracture',
  CARIES: 'tooth_cond_caries',
  FILLING: 'tooth_cond_filling',
  CROWN: 'tooth_cond_crown',
  VENEER: 'tooth_cond_veneer',
  BRIDGE: 'tooth_cond_bridge',
  ROOT_CANAL: 'tooth_cond_root_canal',
  EXTRACTION: 'tooth_cond_extraction',
  IMPLANT: 'tooth_cond_implant',
};

export function conditionLabelKey(code) {
  return LABEL_KEYS[code] || code;
}

export function inferConditionFromName(name) {
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

export function conditionCssClass(code) {
  if (!code || code === 'HEALTHY') return '';
  return `is-cond-${String(code).toLowerCase().replace(/_/g, '-')}`;
}
