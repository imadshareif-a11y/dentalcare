export function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nowLocalMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function slotToMinutes(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(':').map(Number);
  return h * 60 + m;
}

/** هل الموعد (تاريخ + وقت البداية) قبل الآن؟ */
export function isSlotInPast(dateIso, slot) {
  const day = String(dateIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const today = todayIsoLocal();
  if (day < today) return true;
  if (day > today) return false;
  const mins = slotToMinutes(slot);
  if (mins == null) return false;
  return mins < nowLocalMinutes();
}

export function isAppointmentInPast(dateIso, slot) {
  return isSlotInPast(dateIso, slot);
}

/** هل التاريخ قبل اليوم (يوم كامل في الماضي)؟ */
export function isDateBeforeToday(dateIso) {
  const day = String(dateIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day < todayIsoLocal();
}
