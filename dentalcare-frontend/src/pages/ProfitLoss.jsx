// pages/ProfitLoss.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

export default function ProfitLoss() {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    if (!fromDate || !toDate) {
      setError(t('accounts_required'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await api.get('/reports/profit-loss', { fromDate, toDate });
      setReport(data);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const isProfit = report && report.netProfit >= 0;
  const hasActivity = report && (report.revenues.length > 0 || report.expenses.length > 0);

  return (
    <div className="space-y-4">
      <h3>{t('pl_title')}</h3>

      <div style={{ display: 'flex', gap: 4 }}>
        <label>
          {t('ledger_from')}
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          {t('ledger_to')}
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button onClick={generate} disabled={loading}>
          {loading ? t('ledger_loading') : t('ledger_show')}
        </button>
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {report && !hasActivity && <div>{t('pl_none')}</div>}

      {report && hasActivity && (
        <div className="space-y-3">
          <div>
            <h4>{t('pl_revenues')}</h4>
            <table className="w-full text-sm">
              <tbody>
                {report.revenues.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontWeight: 'bold' }}>{t('pl_total_revenue')}: {report.totalRevenue.toFixed(2)}</div>
          </div>

          <div>
            <h4>{t('pl_expenses')}</h4>
            <table className="w-full text-sm">
              <tbody>
                {report.expenses.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontWeight: 'bold' }}>{t('pl_total_expense')}: {report.totalExpense.toFixed(2)}</div>
          </div>

          <div style={{ color: isProfit ? 'green' : 'crimson', fontWeight: 'bold', fontSize: '1.1em' }}>
            {isProfit ? t('pl_net_profit') : t('pl_net_loss')}: {Math.abs(report.netProfit).toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
