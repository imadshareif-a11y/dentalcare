import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import PartyAccountSelect from './PartyAccountSelect';
import CurrencySelect from './CurrencySelect';
import DocumentImageAttach from './DocumentImageAttach';
import ClinicNumberInput from './ClinicNumberInput';
import DocPartyDateRow from './DocPartyDateRow';
import DocumentFormShell, { DocSection, DocTotalBar } from './DocumentFormShell';
import { useCurrencies } from '../hooks/useCurrencies';
import { useSettings } from '../context/SettingsContext';
import { useDocumentDraftBinding } from '../hooks/useDocumentDraftBinding';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PurchaseInvoiceForm({ accounts, onPosted, draft, registerDraftHandlers }) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const { currencies, baseCurrency } = useCurrencies();
  const expenseAccounts = accounts.filter((a) => a.account_type === 'EXPENSE');

  const [supplierAccountId, setSupplierAccountId] = useState('');
  const [docDate, setDocDate] = useState(todayIso);
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

  const getPayload = useCallback(() => ({
    supplierAccountId,
    docDate,
    expenseAccountId,
    currencyId,
    amount,
    memo,
    idempotencyKey,
  }), [supplierAccountId, docDate, expenseAccountId, currencyId, amount, memo, idempotencyKey]);

  const applyPayload = useCallback((p) => {
    if (p.supplierAccountId != null) setSupplierAccountId(p.supplierAccountId);
    if (p.docDate) setDocDate(p.docDate);
    if (p.expenseAccountId != null) setExpenseAccountId(p.expenseAccountId);
    if (p.currencyId) setCurrencyId(p.currencyId);
    if (p.amount != null) setAmount(String(p.amount));
    if (p.memo != null) setMemo(p.memo);
    if (p.idempotencyKey) setIdempotencyKey(p.idempotencyKey);
  }, []);

  const getSummary = useCallback(() => {
    const supplier = accounts.find((a) => a.id === supplierAccountId);
    const name = supplier?.account_name || '';
    const amt = Number(amount) > 0 ? money(Number(amount)) : '';
    return [name, amt, memo].filter(Boolean).join(' — ').slice(0, 500);
  }, [accounts, supplierAccountId, amount, memo, money]);

  useDocumentDraftBinding({
    registerDraftHandlers,
    draft,
    getPayload,
    applyPayload,
    getSummary,
  });

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
    if (!docDate) {
      setError(t('voucher_date_required'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post('/purchase-invoices', {
        supplierAccountId,
        expenseAccountId,
        currencyId,
        amount: numericAmount,
        date: docDate,
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
      setDocDate(todayIso());
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
        <DocPartyDateRow
          accountId={supplierAccountId}
          docDate={docDate}
          onDateChange={setDocDate}
        >
          <PartyAccountSelect
            accounts={accounts}
            value={supplierAccountId}
            onChange={setSupplierAccountId}
            label={t('party_account')}
            required
          />
        </DocPartyDateRow>
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
