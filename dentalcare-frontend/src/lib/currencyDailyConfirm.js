function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function storageKey(userId) {
  return `dc.currencyDailyConfirm.${userId || 'anon'}`;
}

export function hasConfirmedRatesToday(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data?.date === todayIso();
  } catch {
    return false;
  }
}

export function markRatesConfirmedToday(userId, snapshot = {}) {
  localStorage.setItem(storageKey(userId), JSON.stringify({
    date: todayIso(),
    at: new Date().toISOString(),
    ...snapshot,
  }));
}

export function needsDailyRateConfirm(user) {
  if (!user || user.role === 'SUPER_ADMIN') return false;
  if (!['ACCOUNTANT', 'RECEPTIONIST'].includes(user.role)) return false;
  return !hasConfirmedRatesToday(user.id);
}
