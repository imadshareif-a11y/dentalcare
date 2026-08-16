// pages/Checks.jsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

const STATUS_LABEL_KEY = {
  PENDING: 'check_status_pending',
  CLEARED: 'check_status_cleared',
  BOUNCED: 'check_status_bounced',
  ENDORSED: 'check_status_endorsed',
};

export default function Checks({ accounts, onAccountsChanged }) {
  const { t } = useTranslation();
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clearingId, setClearingId] = useState(null);
  const [bankAccountId, setBankAccountId] = useState('');
  const [endorsingId, setEndorsingId] = useState(null);
  const [payeeAccountId, setPayeeAccountId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');

  const bankAccounts = accounts.filter((a) => a.account_type === 'ASSET');
  const payeeAccounts = accounts.filter((a) => ['RECEIVABLE', 'EXPENSE'].includes(a.account_type));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/checks');
      setChecks(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const filteredChecks = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return checks.filter((c) => {
      if (q && !`${c.check_number} ${c.bank_name} ${c.drawer_name || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (dueFrom && c.due_date < dueFrom) return false;
      if (dueTo && c.due_date > dueTo) return false;
      return true;
    });
  }, [checks, searchText, dueFrom, dueTo]);

  async function handleClear(checkId) {
    if (!bankAccountId) return;
    try {
      await api.post(`/checks/${checkId}/clear`, { bankAccountId });
      setClearingId(null);
      setBankAccountId('');
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function handleBounce(checkId) {
    if (!confirm(t('check_confirm_bounce'))) return;
    try {
      await api.post(`/checks/${checkId}/bounce`, {});
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function handleEndorse(checkId) {
    if (!payeeAccountId) return;
    try {
      await api.post(`/checks/${checkId}/endorse`, { payeeAccountId });
      setEndorsingId(null);
      setPayeeAccountId('');
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  return (
    <div className="space-y-4">
      <h3>{t('checks_title')}</h3>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder={t('check_search_placeholder')}
          value={searchText} onChange={(e) => setSearchText(e.target.value)}
        />
        <label>
          {t('check_filter_due_from')}
          <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
        </label>
        <label>
          {t('check_filter_due_to')}
          <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
        </label>
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!loading && !error && checks.length === 0 && <div>{t('checks_none')}</div>}
      {!loading && !error && checks.length > 0 && filteredChecks.length === 0 && (
        <div>{t('check_no_results')}</div>
      )}

      {!loading && !error && filteredChecks.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('check_col_number')}</th>
              <th>{t('check_col_bank')}</th>
              <th>{t('check_col_due')}</th>
              <th>{t('check_col_amount')}</th>
              <th>{t('check_col_status')}</th>
              <th>{t('check_col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredChecks.map((c) => (
              <tr key={c.id}>
                <td>{c.check_number}</td>
                <td>{c.bank_name}</td>
                <td>{c.due_date}</td>
                <td>{Number(c.amount).toFixed(2)}</td>
                <td>{t(STATUS_LABEL_KEY[c.status])}</td>
                <td>
                  {c.status === 'PENDING' && (
                    <>
                      {clearingId === c.id ? (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                            <option value="">{t('check_clear_choose_bank')}</option>
                            {bankAccounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.account_name}</option>
                            ))}
                          </select>
                          <button onClick={() => handleClear(c.id)} disabled={!bankAccountId}>
                            {t('check_clear')}
                          </button>
                        </span>
                      ) : (
                        <button onClick={() => setClearingId(c.id)}>{t('check_clear')}</button>
                      )}

                      {c.check_type === 'RECEIVED' && (
                        endorsingId === c.id ? (
                          <span style={{ display: 'flex', gap: 4 }}>
                            <select value={payeeAccountId} onChange={(e) => setPayeeAccountId(e.target.value)}>
                              <option value="">{t('check_endorse_choose_payee')}</option>
                              {payeeAccounts.map((a) => (
                                <option key={a.id} value={a.id}>{a.account_name}</option>
                              ))}
                            </select>
                            <button onClick={() => handleEndorse(c.id)} disabled={!payeeAccountId}>
                              {t('check_endorse')}
                            </button>
                          </span>
                        ) : (
                          <button onClick={() => setEndorsingId(c.id)}>{t('check_endorse')}</button>
                        )
                      )}

                      <button onClick={() => handleBounce(c.id)}>{t('check_bounce')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
