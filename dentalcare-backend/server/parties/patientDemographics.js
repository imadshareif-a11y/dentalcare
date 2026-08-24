function formatBirthDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ageFromBirthDate(birthDate) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday = (today.getMonth() + 1 > m)
    || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function parseBirthDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw Object.assign(new Error('تاريخ الميلاد غير صالح'), { statusCode: 400 });
  }
  const [y, m, d] = raw.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw Object.assign(new Error('تاريخ الميلاد غير صالح'), { statusCode: 400 });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date > today) {
    throw Object.assign(new Error('تاريخ الميلاد لا يمكن أن يكون في المستقبل'), { statusCode: 400 });
  }
  return raw;
}

function mapPatientRow(row) {
  const birthDate = formatBirthDate(row.birth_date);
  return {
    ...row,
    birth_date: birthDate,
    age: ageFromBirthDate(birthDate),
    billing_party_id: row.billing_party_id || null,
    billing_party_name: row.billing_party_name || null,
    billing_account_id: row.billing_account_id || row.account_id || null,
    is_dependent: Boolean(row.is_dependent || row.billing_party_id),
    dependents_count: Number(row.dependents_count || 0),
    has_movements: Boolean(row.has_movements),
  };
}

module.exports = {
  parseBirthDate,
  ageFromBirthDate,
  mapPatientRow,
};
