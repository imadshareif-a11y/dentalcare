import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import PartyAccountSelect from './PartyAccountSelect';
import CurrencySelect from './CurrencySelect';
import DocumentImageAttach from './DocumentImageAttach';
import ClinicNumberInput from './ClinicNumberInput';
import { useCurrencies } from '../hooks/useCurrencies';

export default function PurchaseInvoiceForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const expenseAccounts = accounts.filter((a) => a.account_type === 'EXPENSE');

  const [supplierAccountId, setSupplierAccountId] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState(
    () => expenseAccounts.find((a) => a.account_code === '5200')?.id || ''
  );
  const [currencyId, setCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!currencyId && baseCurrency?.id) setCurrencyId(baseCurrency.id);
  }, [baseCurrency, currencyId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const numericAmount = Number(amount);
    if (!supplierAccountId || !expenseAccountId) {
      setError(t('accounts_required'));
      return;
    }
    if (!currencyId) {
      setError(t('doc_currency_required'));
      return;
    }
    if (!numericAmount || numericAmount <= 0) {
      setError(t('amount_required'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post('/purchase-invoices', {
        supplierAccountId,
        expenseAccountId,
        currencyId,
        amount: numericAmount,
        memo: memo || undefined,
        idempotencyKey,
      });

      if (attachment && result.journalEntryId) {
        try {
          const form = new FormData();
          form.append('file', attachment);
          await api.uploadForm(`/journal-entries/${result.journalEntryId}/attachment`, form);
        } catch (uploadErr) {
          console.error('Purchase invoice attachment upload failed:', uploadErr);
        }
      }

      setSupplierAccountId('');
      setCurrencyId(baseCurrency?.id || '');
      setAmount('');
      setMemo('');
      setAttachment(null);
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
      <h3>{t('purchase_invoice_title')}</h3>
      <PartyAccountSelect
        accounts={accounts}
        value={supplierAccountId}
        onChange={setSupplierAccountId}
        label={t('party_account')}
        required
      />
      <div>
        <label>{t('purchase_expense_account')}</label>
        <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} required>
          <option value="">{t('voucher_choose_account')}</option>
          {expenseAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </div>
      <CurrencySelect value={currencyId} onChange={setCurrencyId} currencies={currencies} />
      <div>
        <label>{t('amount')}</label>
        <ClinicNumberInput
          showCurrency
          currencySymbol={currencies.find((c) => c.id === currencyId)?.symbol || baseCurrency?.symbol}
          min="0"
          step="0.01"
          value={amount}
          onChange={setAmount}
          required
        />
      </div>
      <input type="text" placeholder={t('voucher_memo')} value={memo} onChange={(e) => setMemo(e.target.value)} />

      <DocumentImageAttach
        file={attachment}
        onChange={setAttachment}
        titleKey="purchase_attachment_title"
        hintKey="purchase_attachment_hint"
        inputId="purchase-invoice-attachment"
      />

      {error && <div className="dc-error">{error}</div>}
      <button type="submit" className="dc-success" disabled={submitting}>
        {submitting ? t('saving_voucher') : t('save_voucher')}
      </button>
    </form>
  );
}
