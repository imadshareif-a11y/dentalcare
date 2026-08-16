// components/ReceiptForm.jsx
// -----------------------------------------------------------
// لما "الدفع بشيك" مفعّل، كل شيك بالقائمة بيترحّل كقيد محاسبي
// مستقل بذاته (شوف routes/vouchers.js) — لهيك كل شيك إله
// idempotencyKey خاص فيه، مش مفتاح واحد مشترك للنموذج كله.
// -----------------------------------------------------------

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import CheckFields from './CheckFields';

export default function ReceiptForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const cashAccounts = accounts.filter((a) => a.account_type === 'ASSET');
  const patientAccounts = accounts.filter((a) => a.account_type === 'RECEIVABLE');

  const [cashAccountId, setCashAccountId] = useState('');
  const [patientAccountId, setPatientAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [isCheck, setIsCheck] = useState(false);
  const [checkList, setCheckList] = useState([]); // [{..., idempotencyKey}]
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const checksTotal = checkList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  function addCheckRow() {
    setCheckList((prev) => [...prev, { idempotencyKey: newIdempotencyKey() }]);
  }

  function updateCheckRow(index, updated) {
    setCheckList((prev) => prev.map((c, i) => (i === index ? { ...updated, idempotencyKey: c.idempotencyKey } : c)));
  }

  function removeCheckRow(index) {
    setCheckList((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleIsCheck(checked) {
    setIsCheck(checked);
    if (checked && checkList.length === 0) addCheckRow();
    if (!checked) setCheckList([]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!cashAccountId || !patientAccountId) {
      setError(t('accounts_required'));
      return;
    }

    if (isCheck) {
      if (checkList.length === 0) {
        setError(t('accounts_required'));
        return;
      }
      for (const c of checkList) {
        if (!c.checkNumber || !c.bankName || !c.dueDate || !Number(c.amount) || Number(c.amount) <= 0) {
          setError(t('amount_required'));
          return;
        }
      }
    } else {
      const numericAmount = Number(amount);
      if (!numericAmount || numericAmount <= 0) {
        setError(t('amount_required'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await api.post('/receipts', {
        cashAccountId,
        patientAccountId,
        amount: isCheck ? undefined : Number(amount),
        memo,
        idempotencyKey,
        checks: isCheck ? checkList : undefined,
      });

      setCashAccountId('');
      setPatientAccountId('');
      setAmount('');
      setMemo('');
      setIsCheck(false);
      setCheckList([]);
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

      <label>
        <input type="checkbox" checked={isCheck} onChange={(e) => toggleIsCheck(e.target.checked)} />
        {' '}{t('paid_by_check')}
      </label>

      {!isCheck && (
        <div>
          <label>{t('amount')}</label>
          <input
            type="number" min="0" step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)} required
          />
        </div>
      )}

      {isCheck && (
        <div className="space-y-2">
          {checkList.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
              <CheckFields check={c} onChange={(updated) => updateCheckRow(i, updated)} showAmount />
              <button type="button" onClick={() => removeCheckRow(i)}>×</button>
            </div>
          ))}
          <button type="button" onClick={addCheckRow}>{t('check_add')}</button>
          <div>{t('checks_total')}: {checksTotal.toFixed(2)}</div>
        </div>
      )}

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
