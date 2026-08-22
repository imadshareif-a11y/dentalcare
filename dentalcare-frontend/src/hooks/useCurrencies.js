import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { dedupeByCode } from '../lib/dedupeList';

export function useCurrencies() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/currencies');
      const list = dedupeByCode(Array.isArray(rows) ? rows : [], 'code', 'id');
      setCurrencies(list.filter((c) => c.is_active !== false));
    } catch {
      setCurrencies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const baseCurrency = useMemo(
    () => currencies.find((c) => c.is_base) || currencies[0] || null,
    [currencies]
  );

  return { currencies, baseCurrency, loading, reload };
}
