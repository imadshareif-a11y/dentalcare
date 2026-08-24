import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import PartyAccountSelect from './PartyAccountSelect';
import CurrencySelect from './CurrencySelect';
import DocumentImageAttach from './DocumentImageAttach';
import ClinicNumberInput from './ClinicNumberInput';
import DocumentFormShell, { DocSection, DocTotalBar } from './DocumentFormShell';
import { useCurrencies } from '../hooks/useCurrencies';
import { useSettings } from '../context/SettingsContext';

export default function PurchaseInvoiceForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const { money } = useSettings();
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
    <DocumentFormShell
      variant="purchase"
      title={t('purchase_invoice_title')}
      subtitle={t('doc_purchase_subtitle')}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      totals={Number(amount) > 0 ? (
        <DocTotalBar
          highlight={{
            label: t('voucher_document_total'),
            value: money(Number(amount) || 0),
          }}
        />
      ) : null}
    >
      <DocSection title={t('doc_section_party')}>
        <PartyAccountSelect
          accounts={accounts}
          value={supplierAccountId}
          onChange={setSupplierAccountId}
          label={t('party_account')}
          required
        />
        <div className="dc-form-field dc-field-select-md">
          <label>{t('purchase_expense_account')}</label>
          <select value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} required>
            <option value="">{t('voucher_choose_account')}</option>
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.account_name}</option>
            ))}
          </select>
        </div>
      </DocSection>

      <DocSection title={t('doc_section_amount')}>
        <div className="dc-form-row">
          <CurrencySelect value={currencyId} onChange={setCurrencyId} currencies={currencies} />
          <div className="dc-doc-cash-hero dc-form-field dc-field-amount">
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
        </div>
      </DocSection>

      <DocSection title={t('doc_section_details')}>
        <input type="text" className="dc-field-memo" placeholder={t('voucher_memo')} value={memo} onChange={(e) => setMemo(e.target.value)} />
        <DocumentImageAttach
          file={attachment}
          onChange={setAttachment}
          titleKey="purchase_attachment_title"
          hintKey="purchase_attachment_hint"
          inputId="purchase-invoice-attachment"
        />
      </DocSection>
    </DocumentFormShell>
  );
}
