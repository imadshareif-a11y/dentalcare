// pages/TrialBalance.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export default function TrialBalance() {
  const { t } = useTranslation();
  const [asOfDate, setAsOfDate] = useState('');
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setError(null);
    setLoading(true);
    try {
      const data = await api.get('/reports/trial-balance', asOfDate ? { asOfDate } : undefined);
      setRows(data);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  const totalDebit = rows ? rows.reduce((s, r) => s + Number(r.total_debit), 0) : 0;
  const totalCredit = rows ? rows.reduce((s, r) => s + Number(r.total_credit), 0) : 0;
  // بميزان مراجعة صحيح، إجمالي المدين لازم يساوي إجمالي الدائن
  // دايمًا (نتيجة مباشرة لقاعدة توازن كل قيد بمحرك المحاسبة) —
  // هاي هون فحص عرض بصري بس، مش تحقق فعلي (التحقق الحقيقي صار
  // مسبقًا وقت ترحيل كل قيد بالـ backend)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="space-y-4">
      <h3>{t('trial_balance_title')}</h3>

      <div style={{ display: 'flex', gap: 4 }}>
        <label>
          {t('trial_balance_as_of')}
          <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </label>
        <button onClick={generate} disabled={loading}>
          {loading ? t('ledger_loading') : t('trial_balance_show')}
        </button>
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {rows && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('trial_balance_col_code')}</th>
                <th>{t('trial_balance_col_name')}</th>
                <th>{t('trial_balance_col_type')}</th>
                <th>{t('trial_balance_col_debit')}</th>
                <th>{t('trial_balance_col_credit')}</th>
                <th>{t('trial_balance_col_balance')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account_code}>
                  <td>{r.account_code}</td>
                  <td>{r.account_name}</td>
                  <td>{r.account_type}</td>
                  <td>{Number(r.total_debit).toFixed(2)}</td>
                  <td>{Number(r.total_credit).toFixed(2)}</td>
                  <td>{Number(r.balance).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={3}>{t('trial_balance_totals')}</td>
                <td>{totalDebit.toFixed(2)}</td>
                <td>{totalCredit.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <div style={{ color: isBalanced ? 'green' : 'crimson', fontWeight: 'bold' }}>
            {isBalanced ? t('trial_balance_balanced') : t('trial_balance_unbalanced')}
          </div>
        </>
      )}
    </div>
  );
}
