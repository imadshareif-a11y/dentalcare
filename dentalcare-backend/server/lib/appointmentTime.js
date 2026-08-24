function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function slotToMinutes(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(':').map(Number);
  return h * 60 + m;
}

function isAppointmentInPast(day, slot) {
  const dateIso = String(day || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const today = todayIsoLocal();
  if (dateIso < today) return true;
  if (dateIso > today) return false;
  const mins = slotToMinutes(slot);
  if (mins == null) return false;
  const d = new Date();
  return mins < d.getHours() * 60 + d.getMinutes();
}

function assertBookingNotPast(day, slot, { allowIfSameAs = null } = {}) {
  if (!isAppointmentInPast(day, slot)) return;
  if (allowIfSameAs) {
    const sameDay = String(day || '').slice(0, 10) === String(allowIfSameAs.day || '').slice(0, 10);
    const sameSlot = String(slot || '').trim() === String(allowIfSameAs.slot || '').trim();
    if (sameDay && sameSlot) return;
  }
  throw Object.assign(new Error('لا يمكن حجز موعد في وقت ماضٍ'), { statusCode: 400 });
}

module.exports = {
  isAppointmentInPast,
  assertBookingNotPast,
};
