/** ألوان المستندات — متطابقة مع `.dc-doc-form.tone-*` */
export const DOCUMENT_TONE_BY_KEY = {
  receipt: 'receipt',
  payment: 'payment',
  purchase: 'purchase',
  creditNote: 'credit',
  debitNote: 'debit',
  bankEntry: 'bank',
  voucher: 'journal',
};

export const DOCUMENT_TONE_BY_SOURCE = {
  RECEIPT: 'receipt',
  PAYMENT: 'payment',
  PURCHASE_INVOICE: 'purchase',
  CREDIT_NOTE: 'credit',
  DEBIT_NOTE: 'debit',
  BANK_ENTRY: 'bank',
  JOURNAL: 'journal',
};

/** ألوان بطاقات المراكز (حسابات، مستندات، تقارير، مفضلة) */
export const HUB_TILE_TONE_BY_KEY = {
  ...DOCUMENT_TONE_BY_KEY,

  // حسابات
  chartTree: 'indigo',
  currencies: 'amber',
  currencyRates: 'teal',
  cashBoxes: 'emerald',
  banks: 'bank',
  expenseAccounts: 'rose',
  assetAccounts: 'violet',

  // أطراف
  patients: 'teal',
  suppliers: 'amber',
  doctors: 'sky',
  employees: 'indigo',

  // تقارير
  ledger: 'slate',
  checks: 'emerald',
  clinicalReport: 'teal',
  trialBalance: 'indigo',
  profitLoss: 'emerald',
  expenses: 'rose',
  journalBook: 'slate',

  // اختصارات المفضلة
  newPatient: 'teal',
  newSupplier: 'amber',
  clinical: 'teal',
  admin: 'indigo',
};

export function hubTileToneForKey(key) {
  return HUB_TILE_TONE_BY_KEY[key] || null;
}

export function documentToneForKey(key) {
  return DOCUMENT_TONE_BY_KEY[key] || null;
}

export function documentToneForSource(sourceType) {
  return DOCUMENT_TONE_BY_SOURCE[sourceType] || null;
}
