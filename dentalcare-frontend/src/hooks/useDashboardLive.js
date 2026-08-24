import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * تحديث دوري + نبض ساعة للواجهة الحية (بدون وميض تحميل عند كل تحديث).
 */
export function useDashboardLive(loadFn, { intervalMs = 15_000, tickMs = 1_000 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [flashKey, setFlashKey] = useState(0);
  const firstLoad = useRef(true);
  const loadFnRef = useRef(loadFn);
  loadFnRef.current = loadFn;

  const load = useCallback(async ({ silent = false } = {}) => {
    setError(null);
    if (firstLoad.current) setLoading(true);
    else if (!silent) setRefreshing(true);
    try {
      const row = await loadFnRef.current();
      setData(row);
      setFlashKey((k) => k + 1);
      firstLoad.current = false;
      return row;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load({ silent: false }).catch(() => {});
    const timer = window.setInterval(() => {
      load({ silent: true }).catch(() => {});
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [load, intervalMs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);

  return {
    data,
    setData,
    loading,
    refreshing,
    error,
    setError,
    now,
    flashKey,
    reload: () => load({ silent: false }),
  };
}

export function relativeUpdated(generatedAt, now, t) {
  if (!generatedAt) return '—';
  const ts = new Date(generatedAt).getTime();
  if (!Number.isFinite(ts)) return '—';
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 8) return t('dashboard_live_just_now');
  if (sec < 60) return t('dashboard_live_seconds', { count: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t('dashboard_live_minutes', { count: min });
  return t('dashboard_live_hours', { count: Math.floor(min / 60) });
}

/** عدّاد KPI حي عند تغيّر القيمة */
export function useCountUp(value, durationMs = 520) {
  const numeric = Number(value);
  const target = Number.isFinite(numeric) ? numeric : 0;
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) {
      setDisplay(target);
      return undefined;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (ts) => {
      const p = Math.min(1, (ts - start) / durationMs);
      const eased = 1 - ((1 - p) ** 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}

export function dashboardErrorMessage(err, t) {
  if (!err) return null;
  if (err.body?.error) return err.body.error;
  if (err.message) return err.message;
  return t('error_network');
}
