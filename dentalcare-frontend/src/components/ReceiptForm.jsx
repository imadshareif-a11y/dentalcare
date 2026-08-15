// components/ReceiptForm.jsx
// -----------------------------------------------------------
// نموذج مبسّط فوق /api/receipts. نفس المبادئ الأمنية بـ
// VoucherForm: idempotencyKey ثابت طول عمر النموذج، لا حساب
// أرصدة محليًا، كل خطأ يُعرض صريح.
// -----------------------------------------------------------

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';

export default function ReceiptForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const cashAccounts = accounts.filter((a) => a.account_type === 'ASSET');
  const patientAccounts = accounts.filter((a) => a.account_type === 'RECEIVABLE');

  const [cashAccountId, setCashAccountId] = useState('');
  const [patientAccountId, setPatientAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!cashAccountId || !patientAccountId) {
      setError(t('accounts_required'));
      return;
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      setError(t('amount_required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/receipts', {
        cashAccountId,
        patientAccountId,
        amount: numericAmount,
        memo,
        idempotencyKey,
      });

      setCashAccountId('');
      setPatientAccountId('');
      setAmount('');
      setMemo('');
      setIdempotencyKey(newIdempotencyKey());
      onPosted?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('receipt_title')}</h3>

      <div>
        <label>{t('receipt_cash_account')}</label>
        <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} required>
          <option value="">{t('voucher_choose_account')}</option>
          {cashAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label>{t('receipt_patient_account')}</label>
        <select value={patientAccountId} onChange={(e) => setPatientAccountId(e.target.value)} required>
          <option value="">{t('voucher_choose_account')}</option>
          {patientAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label>{t('amount')}</label>
        <input
          type="number" min="0" step="0.01"
          value={amount} onChange={(e) => setAmount(e.target.value)} required
        />
      </div>

      <input
        type="text" placeholder={t('voucher_memo')}
        value={memo} onChange={(e) => setMemo(e.target.value)}
      />

      {error && <div style={{ color: 'crimson', fontWeight: 'bold' }}>{error}</div>}

      <button type="submit" disabled={submitting}>
        {submitting ? t('saving_voucher') : t('save_voucher')}
      </button>
    </form>
  );
}
