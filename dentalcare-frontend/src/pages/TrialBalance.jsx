// pages/TrialBalance.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import ReportPeriodPicker from '../components/ReportPeriodPicker';
import useReportPeriod from '../hooks/useReportPeriod';

export default function TrialBalance() {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  const { asOfDate, preset, setAsOfDate, setPreset } = useReportPeriod();
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

      <div className="no-print" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>{t('trial_balance_as_of')}</label>
        <ReportPeriodPicker
          mode="asOf"
          asOfDate={asOfDate}
          preset={preset}
          onAsOfDate={setAsOfDate}
          onPreset={setPreset}
        />
        <button onClick={generate} disabled={loading}>
          {loading ? t('ledger_loading') : t('trial_balance_show')}
        </button>
        {rows && <PrintButton />}
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      {rows && (
        <div className="print-document">
          <PrintHeader
            title={t('trial_balance_title')}
            subtitle={asOfDate ? t('report_period_as_of', { date: date(asOfDate) }) : undefined}
          />
          <table className="w-full text-sm print-table">
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
                  <td>{money(r.total_debit)}</td>
                  <td>{money(r.total_credit)}</td>
                  <td>{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 'bold' }}>
                <td colSpan={3}>{t('trial_balance_totals')}</td>
                <td>{money(totalDebit)}</td>
                <td>{money(totalCredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <div style={{ color: isBalanced ? 'green' : 'crimson', fontWeight: 'bold' }}>
            {isBalanced ? t('trial_balance_balanced') : t('trial_balance_unbalanced')}
          </div>
        </div>
      )}
    </div>
  );
}
