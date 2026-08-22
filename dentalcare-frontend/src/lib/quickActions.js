// Catalog of quick-access actions for the Favorites tab.

export const DEFAULT_QUICK_ACTIONS = [
  'receipt',
  'payment',
  'currencyRates',
  'newPatient',
  'newSupplier',
  'purchase',
];

export const QUICK_ACTION_CATALOG = [
  {
    id: 'receipt',
    kind: 'tab',
    tab: 'receipt',
    labelKey: 'nav_receipt',
    icon: 'fa-solid fa-file-invoice-dollar',
    can: (p) => p('receipts') === 'edit',
  },
  {
    id: 'payment',
    kind: 'tab',
    tab: 'payment',
    labelKey: 'nav_payment',
    icon: 'fa-solid fa-money-bill-transfer',
    can: (p) => p('payments') === 'edit',
  },
  {
    id: 'purchase',
    kind: 'tab',
    tab: 'purchase',
    labelKey: 'nav_purchase_invoice',
    icon: 'fa-solid fa-cart-shopping',
    can: (p) => p('payments') === 'edit',
  },
  {
    id: 'currencyRates',
    kind: 'modal',
    modal: 'currencyDaily',
    labelKey: 'fav_currency_rates',
    icon: 'fa-solid fa-coins',
    can: (p) => p('accounts') !== 'none'
      || p('receipts') === 'edit'
      || p('payments') === 'edit'
      || p('journal') === 'edit',
  },
  {
    id: 'newPatient',
    kind: 'modal',
    modal: 'patient',
    labelKey: 'fav_new_patient',
    icon: 'fa-solid fa-user-plus',
    can: (p) => p('patients') === 'edit',
  },
  {
    id: 'newSupplier',
    kind: 'modal',
    modal: 'supplier',
    labelKey: 'fav_new_supplier',
    icon: 'fa-solid fa-truck',
    can: (p) => p('payments') === 'edit',
  },
  {
    id: 'bankEntry',
    kind: 'tab',
    tab: 'bankEntry',
    labelKey: 'nav_bank_entry',
    icon: 'fa-solid fa-building-columns',
    can: (p) => p('journal') === 'edit' || p('payments') === 'edit' || p('accounts') === 'edit',
  },
  {
    id: 'voucher',
    kind: 'tab',
    tab: 'voucher',
    labelKey: 'nav_voucher',
    icon: 'fa-solid fa-book',
    can: (p) => p('journal') === 'edit',
  },
  {
    id: 'checks',
    kind: 'tab',
    tab: 'checks',
    labelKey: 'nav_checks',
    icon: 'fa-solid fa-money-check',
    can: (p) => p('checks') !== 'none',
  },
  {
    id: 'ledger',
    kind: 'tab',
    tab: 'ledger',
    labelKey: 'nav_ledger',
    icon: 'fa-solid fa-scroll',
    can: (p) => p('reports') !== 'none',
  },
  {
    id: 'clinical',
    kind: 'section',
    section: 'clinical',
    tab: 'clinical',
    labelKey: 'nav_clinical',
    icon: 'fa-solid fa-user-doctor',
    can: (p) => p('clinical') !== 'none' || p('appointments') !== 'none',
  },
  {
    id: 'patients',
    kind: 'section',
    section: 'patients',
    tab: 'patients',
    labelKey: 'nav_patients',
    icon: 'fa-solid fa-users',
    can: (p) => p('patients') !== 'none',
  },
  {
    id: 'creditNote',
    kind: 'tab',
    tab: 'creditNote',
    labelKey: 'nav_credit_note',
    icon: 'fa-solid fa-file-circle-minus',
    can: (p) => p('receipts') === 'edit' || p('payments') === 'edit' || p('journal') === 'edit',
  },
  {
    id: 'debitNote',
    kind: 'tab',
    tab: 'debitNote',
    labelKey: 'nav_debit_note',
    icon: 'fa-solid fa-file-circle-plus',
    can: (p) => p('receipts') === 'edit' || p('payments') === 'edit' || p('journal') === 'edit',
  },
];

export function normalizeQuickActions(ids) {
  const allowed = new Set(QUICK_ACTION_CATALOG.map((a) => a.id));
  const list = Array.isArray(ids) ? ids.filter((id) => allowed.has(id)) : [];
  return list.length > 0 ? [...new Set(list)] : [...DEFAULT_QUICK_ACTIONS];
}

export function resolveQuickActions(ids, permissions = {}) {
  const level = (key) => permissions?.[key] || 'none';
  const selected = normalizeQuickActions(ids);
  return selected
    .map((id) => QUICK_ACTION_CATALOG.find((a) => a.id === id))
    .filter((a) => a && a.can(level));
}

export function findAccGroupForTab(accGroups, tabKey) {
  for (const group of accGroups) {
    if (group.keys?.includes(tabKey)) return { groupId: group.id, subGroupId: null };
    for (const sg of group.subgroups || []) {
      if (sg.keys?.includes(tabKey)) return { groupId: group.id, subGroupId: sg.id };
    }
  }
  return null;
}
