// tenants/access.js — قواعد تفعيل العيادة (حالة + فترة زمنية)

function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateInput(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

function defaultActiveUntil(fromDate) {
  const from = fromDate || todayUTC();
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function clinicAccessDeniedReason(tenant) {
  if (!tenant) return 'العيادة غير موجودة';
  if (tenant.status && tenant.status !== 'ACTIVE') {
    return 'هذه العيادة موقوفة. تواصل مع إدارة المنصة';
  }
  const today = todayUTC();
  const from = toDateOnly(tenant.active_from);
  const until = toDateOnly(tenant.active_until);
  if (from && today < from) return 'فترة تفعيل هذه العيادة لم تبدأ بعد';
  if (until && today > until) return 'انتهت مدة تفعيل هذه العيادة';
  return null;
}

module.exports = {
  todayUTC,
  parseDateInput,
  defaultActiveUntil,
  clinicAccessDeniedReason,
};
