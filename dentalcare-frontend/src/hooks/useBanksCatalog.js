import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

export function useBanksCatalog() {
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.get('/banks');
      setBanks(Array.isArray(rows) ? rows : []);
    } catch {
      setBanks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function findByNumber(bankNumber) {
    const n = String(bankNumber || '').trim();
    if (!n) return null;
    return banks.find((b) => String(b.bank_number).trim() === n) || null;
  }

  return { banks, loading, reload, findByNumber };
}
