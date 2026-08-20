import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import ReportPeriodPicker from '../components/ReportPeriodPicker';
import useReportPeriod from '../hooks/useReportPeriod';

export default function ClinicalReport() {
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
      setReport(await api.get('/reports/clinical', { fromDate, toDate }));
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  const periodLabel = fromDate && toDate
    ? t('report_period_range', { from: date(fromDate), to: date(toDate) })
    : '';

  return (
    <div className="space-y-4">
      <h3 className="no-print">{t('nav_clinical_report')}</h3>
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
      {report && (
        <div className="print-document">
          <PrintHeader title={t('nav_clinical_report')} subtitle={periodLabel} />
          <div className="print-summary">
            {t('clinical_report_summary', { count: report.count, total: money(report.total) })}
          </div>
          {report.sessions.map((session) => (
            <div key={session.id} className="print-session-block">
              <div className="print-session-head">
                {date(session.session_date)} — {session.patient_name}
                {session.doctor_name ? ` — ${session.doctor_name}` : ''}
                {' — '}{money(session.total)}
              </div>
              <table className="w-full text-sm print-table">
                <thead>
                  <tr>
                    <th>{t('clinical_report_col_tooth')}</th>
                    <th>{t('clinical_report_col_treatment')}</th>
                    <th>{t('clinical_treatment_cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {session.items.map((item, i) => (
                    <tr key={i}>
                      <td>#{item.tooth || '—'}</td>
                      <td>{item.name}</td>
                      <td className="dc-money">{money(item.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {session.notes ? (
                <div className="print-session-notes">
                  <strong>{t('clinical_session_notes')}:</strong> {session.notes}
                </div>
              ) : null}
            </div>
          ))}
          {report.sessions.length === 0 && <div>{t('clinical_report_none')}</div>}
        </div>
      )}
    </div>
  );
}
