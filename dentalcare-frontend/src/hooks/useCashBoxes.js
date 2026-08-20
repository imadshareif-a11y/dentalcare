import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

/** صناديق نقدية/شيكات من الـ API */
export function useCashBoxes() {
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/cash-boxes');
      setBoxes(Array.isArray(rows) ? rows : []);
    } catch {
      setBoxes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const cashBoxes = useMemo(() => boxes.filter((b) => b.box_kind === 'CASH' && b.is_active !== false), [boxes]);
  const checksInBoxes = useMemo(() => boxes.filter((b) => b.box_kind === 'CHECKS_IN' && b.is_active !== false), [boxes]);
  const checksOutBoxes = useMemo(() => boxes.filter((b) => b.box_kind === 'CHECKS_OUT' && b.is_active !== false), [boxes]);

  const baseCashBox = useMemo(
    () => cashBoxes.find((b) => b.currency_is_base) || cashBoxes[0] || null,
    [cashBoxes]
  );

  return {
    boxes,
    cashBoxes,
    checksInBoxes,
    checksOutBoxes,
    baseCashBox,
    loading,
    reload,
  };
}
