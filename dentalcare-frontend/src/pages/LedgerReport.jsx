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

export default function LedgerReport({ accounts }) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
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
      <div className="flex gap-2">
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">{t('ledger_choose_account')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button onClick={generateReport} disabled={loading}>
          {loading ? t('ledger_loading') : t('ledger_show')}
        </button>
      </div>

      {error && <div className="text-rose-700 font-bold">{error}</div>}

      {report && (
        <div>
          <div className="flex justify-between font-bold border-b pb-2">
            <span>{report.accountName}</span>
            <span>{t('ledger_opening_balance')}: {report.openingBalance.toFixed(2)}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('ledger_col_date')}</th><th>{t('ledger_col_details')}</th><th>{t('voucher_debit')}</th><th>{t('voucher_credit')}</th><th>{t('ledger_col_running')}</th>
              </tr>
            </thead>
            <tbody>
              {report.movements.map((m, i) => (
                <tr key={i}>
                  <td>{m.date}</td>
                  <td>{m.details}</td>
                  <td>{m.debit.toFixed(2)}</td>
                  <td>{m.credit.toFixed(2)}</td>
                  <td>{m.runningBalance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="font-bold text-left">
            {t('ledger_closing_balance')}: {report.closingBalance.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
}
