const DEFAULT_KEYS = {
  ar: ['name', 'account_name', 'account_name_ar', 'room_name'],
  en: ['name_en', 'account_name_en', 'room_name_en'],
  he: ['name_he', 'account_name_he', 'room_name_he'],
};

function pickFirst(record, keys) {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

/** عرض الاسم حسب لغة الواجهة الحالية. */
export function localizedDisplay(record, lang, keys = DEFAULT_KEYS) {
  if (lang === 'en') {
    return pickFirst(record, keys.en) || pickFirst(record, keys.ar) || pickFirst(record, keys.he);
  }
  if (lang === 'he') {
    return pickFirst(record, keys.he) || pickFirst(record, keys.ar) || pickFirst(record, keys.en);
  }
  return pickFirst(record, keys.ar) || pickFirst(record, keys.en) || pickFirst(record, keys.he);
}

/** قيمة الحقل للتحرير بلغة الواجهة. */
export function localizedEditValue(record, lang, keys = DEFAULT_KEYS) {
  return localizedDisplay(record, lang, keys);
}

/** حمولة API: اسم واحد + اللغة النشطة. */
export function localizedPayload(name, locale) {
  return {
    name: String(name || '').trim(),
    locale: locale || 'ar',
  };
}

export { DEFAULT_KEYS as LOCALIZED_NAME_KEYS };
