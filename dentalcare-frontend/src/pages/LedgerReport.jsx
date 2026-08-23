// pages/LedgerReport.jsx
// -----------------------------------------------------------
// هذه الصفحة تحديدًا هي حل المشكلة الأصلية يلي بلّشت منها كل
// القصة: "لما بضغط عرض الكشف، ما بيفتح كشف الذمة، بيطلع كل
// الأرصدة". السبب كان عدم تمرير الفلاتر فعليًا. هون accountId
// وfromDate وtoDate بتترسل فعليًا بكل استدعاء، وما في أي مسار
// بالكود بيرجع "كل شي" كـ default.
// -----------------------------------------------------------

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PartyAccountSelect from '../components/PartyAccountSelect';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import { useSettings } from '../context/SettingsContext';
import ReportPeriodPicker from '../components/ReportPeriodPicker';
import useReportPeriod from '../hooks/useReportPeriod';

export default function LedgerReport({ accounts }) {
  const { t } = useTranslation();
  const { money, date } = useSettings();
  const { fromDate, toDate, preset, setFromDate, setToDate, setPreset } = useReportPeriod();
  const [accountId, setAccountId] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generateReport() {
    if (!accountId || !fromDate || !toDate) {
      setError('يجب اختيار الحساب وتحديد الفترة كاملة');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const data = await api.get('/reports/ledger', { accountId, fromDate, toDate });
      setReport(data);
    } catch (err) {
      setError(err.body?.error || 'تعذّر توليد الكشف');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 no-print" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <PartyAccountSelect
          accounts={accounts}
          accountList={accounts}
          value={accountId}
          onChange={setAccountId}
          placeholder={t('ledger_choose_account')}
          compact
          hideHint
          pickerScope="extended"
          fieldClassName="dc-field-party dc-report-party-field"
        />
        <ReportPeriodPicker
          fromDate={fromDate}
          toDate={toDate}
          preset={preset}
          onFromDate={setFromDate}
          onToDate={setToDate}
          onPreset={setPreset}
        />
        <button onClick={generateReport} disabled={loading}>
          {loading ? t('ledger_loading') : t('ledger_show')}
        </button>
        {report && <PrintButton />}
      </div>

      {error && <div className="text-rose-700 font-bold">{error}</div>}

      {report && (
        <div className="print-document">
          <PrintHeader
            title={t('nav_ledger')}
            subtitle={t('report_period_range', { from: date(fromDate), to: date(toDate) })}
          />
          <div className="flex justify-between font-bold border-b pb-2">
            <span>{report.accountName}</span>
            <span>{t('ledger_opening_balance')}: {money(report.openingBalance)}</span>
          </div>
          <table className="w-full text-sm print-table">
            <thead>
              <tr>
                <th>{t('ledger_col_date')}</th><th>{t('ledger_col_details')}</th><th>{t('voucher_debit')}</th><th>{t('voucher_credit')}</th><th>{t('ledger_col_running')}</th>
              </tr>
            </thead>
            <tbody>
              {report.movements.map((m, i) => (
                <tr key={i}>
                  <td>{date(m.date)}</td>
                  <td>{m.details}</td>
                  <td className="dc-money">{money(m.debit)}</td>
                  <td className="dc-money">{money(m.credit)}</td>
                  <td className="dc-money">{money(m.runningBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="font-bold text-left">
            {t('ledger_closing_balance')}: {money(report.closingBalance)}
          </div>
        </div>
      )}
    </div>
  );
}
