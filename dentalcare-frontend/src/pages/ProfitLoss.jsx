// pages/ProfitLoss.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import ReportPeriodPicker from '../components/ReportPeriodPicker';
import useReportPeriod from '../hooks/useReportPeriod';

export default function ProfitLoss() {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  const { fromDate, toDate, preset, setFromDate, setToDate, setPreset } = useReportPeriod();
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

      <div className="no-print" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <ReportPeriodPicker
          fromDate={fromDate}
          toDate={toDate}
          preset={preset}
          onFromDate={setFromDate}
          onToDate={setToDate}
          onPreset={setPreset}
        />
        <button onClick={generate} disabled={loading}>
          {loading ? t('ledger_loading') : t('ledger_show')}
        </button>
        {report && <PrintButton />}
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {report && !hasActivity && <div>{t('pl_none')}</div>}

      {report && hasActivity && (
        <div className="print-document space-y-3">
          <PrintHeader
            title={t('pl_title')}
            subtitle={t('report_period_range', { from: date(fromDate), to: date(toDate) })}
          />
          <div>
            <h4>{t('pl_revenues')}</h4>
            <table className="w-full text-sm print-table">
              <tbody>
                {report.revenues.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td className="dc-money">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontWeight: 'bold' }}>{t('pl_total_revenue')}: {money(report.totalRevenue)}</div>
          </div>

          <div>
            <h4>{t('pl_expenses')}</h4>
            <table className="w-full text-sm print-table">
              <tbody>
                {report.expenses.map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td className="dc-money">{money(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontWeight: 'bold' }}>{t('pl_total_expense')}: {money(report.totalExpense)}</div>
          </div>

          <div style={{ color: isProfit ? 'green' : 'crimson', fontWeight: 'bold', fontSize: '1.1em' }}>
            {isProfit ? t('pl_net_profit') : t('pl_net_loss')}: {money(Math.abs(report.netProfit))}
          </div>
        </div>
      )}
    </div>
  );
}
