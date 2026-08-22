import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import ReportPeriodPicker from '../components/ReportPeriodPicker';
import useReportPeriod from '../hooks/useReportPeriod';

export default function JournalBook() {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  const { fromDate, toDate, preset, setFromDate, setToDate, setPreset } = useReportPeriod();
  const [rows, setRows] = useState(null);
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
      setRows(await api.get('/reports/journal-book', { fromDate, toDate }));
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
      setRows(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <ReportPeriodPicker
          fromDate={fromDate}
          toDate={toDate}
          preset={preset}
          onFromDate={setFromDate}
          onToDate={setToDate}
          onPreset={setPreset}
        />
        <button onClick={generate} disabled={loading}>{loading ? t('ledger_loading') : t('ledger_show')}</button>
        {rows && <PrintButton />}
      </div>
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {rows && (
        <div className="print-document">
          <PrintHeader
            title={t('nav_journal_book')}
            subtitle={t('report_period_range', { from: date(fromDate), to: date(toDate) })}
          />
          <table className="w-full text-sm print-table">
            <thead>
              <tr>
                <th>{t('ledger_col_date')}</th>
                <th>{t('trial_balance_col_code')}</th>
                <th>{t('trial_balance_col_name')}</th>
                <th>{t('ledger_col_details')}</th>
                <th>{t('voucher_debit')}</th>
                <th>{t('voucher_credit')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{date(r.date)}</td>
                  <td>{r.accountCode}</td>
                  <td>{r.accountName}</td>
                  <td>{r.lineMemo || r.memo}</td>
                  <td className="dc-money">{money(r.debit)}</td>
                  <td className="dc-money">{money(r.credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
