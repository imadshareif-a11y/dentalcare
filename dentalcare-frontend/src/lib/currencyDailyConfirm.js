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

export function getLastRatesConfirmInfo(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.at && !data?.date) return null;
    return {
      date: data.date || null,
      at: data.at || null,
      source: data.source || null,
    };
  } catch {
    return null;
  }
}

export function needsDailyRateConfirm(user) {
  if (!user || user.role === 'SUPER_ADMIN') return false;
  if (!['ACCOUNTANT', 'RECEPTIONIST'].includes(user.role)) return false;
  return !hasConfirmedRatesToday(user.id);
}
