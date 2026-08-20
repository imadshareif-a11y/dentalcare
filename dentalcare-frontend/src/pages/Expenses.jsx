import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import ReportPeriodPicker from '../components/ReportPeriodPicker';
import useReportPeriod from '../hooks/useReportPeriod';

export default function Expenses() {
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

  return (
    <div className="space-y-4">
      <h3>{t('expenses_title')}</h3>
      <div className="no-print" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <ReportPeriodPicker
          fromDate={fromDate}
          toDate={toDate}
          preset={preset}
          onFromDate={setFromDate}
          onToDate={setToDate}
          onPreset={setPreset}
        />
        <button type="button" onClick={generate} disabled={loading}>
          {loading ? t('ledger_loading') : t('ledger_show')}
        </button>
        {report && <PrintButton />}
      </div>
      {error && <div className="dc-error">{error}</div>}
      {report && report.expenses.length === 0 && <div>{t('expenses_none')}</div>}
      {report && report.expenses.length > 0 && (
        <div className="print-document">
          <PrintHeader
            title={t('expenses_title')}
            subtitle={t('report_period_range', { from: date(fromDate), to: date(toDate) })}
          />
          <table className="w-full text-sm print-table">
            <thead>
              <tr>
                <th>{t('ledger_col_details')}</th>
                <th>{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {report.expenses.map((row, i) => (
                <tr key={i}>
                  <td>{row.name}</td>
                  <td>{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="font-bold">{t('pl_total_expense')}: {money(report.totalExpense)}</div>
        </div>
      )}
    </div>
  );
}
