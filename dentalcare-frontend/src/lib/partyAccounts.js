/** كل أنواع الذمم تحت قائمة الذمم: مرضى، موردون، أطباء، موظفون. */
export const ALL_PARTY_TYPES = ['PATIENT', 'SUPPLIER', 'DOCTOR', 'EMPLOYEE'];

/**
 * حسابات الذمم من دليل الحسابات.
 * الافتراضي: كل أنواع الذمم قابلة للقبض والصرف والمستندات.
 */
export function partyAccounts(accounts, types = ALL_PARTY_TYPES) {
  const wanted = new Set(types);
  return (accounts || []).filter((a) => a.party_type && wanted.has(a.party_type));
}

export function partyTypeLabelKey(partyType) {
  if (partyType === 'PATIENT') return 'nav_patients';
  if (partyType === 'SUPPLIER') return 'nav_suppliers';
  if (partyType === 'DOCTOR') return 'nav_doctors';
  if (partyType === 'EMPLOYEE') return 'nav_employees';
  return null;
}

/** تسمية خيار الذمة في القوائم المنسدلة مع نوع الطرف. */
export function formatPartyOption(account, t) {
  const name = account?.account_name || '';
  const key = partyTypeLabelKey(account?.party_type);
  if (!key || !t) return name;
  return `${name} — ${t(key)}`;
}
