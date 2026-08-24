import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import PartyAccountSelect from './PartyAccountSelect';
import CurrencySelect from './CurrencySelect';
import ClinicNumberInput from './ClinicNumberInput';
import DocumentFormShell, { DocSection, DocTotalBar } from './DocumentFormShell';
import { useCurrencies } from '../hooks/useCurrencies';
import { useSettings } from '../context/SettingsContext';

function isDiscountAccount(account) {
  if (['4200', '5300'].includes(account.account_code)) return true;
  return /خصم|discount|הנח/i.test(account.account_name || '');
}

function discountAccountsForNote(accounts, isCredit) {
  if (isCredit) {
    return accounts.filter((a) => a.account_code === '5300'
      || (isDiscountAccount(a) && a.account_type === 'EXPENSE' && a.account_code !== '4200'));
  }
  return accounts.filter((a) => a.account_code === '4200'
    || (isDiscountAccount(a) && a.account_type === 'REVENUE' && a.account_code !== '5300'));
}

export default function AdjustmentNoteForm({ type, accounts, onPosted }) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const { currencies, baseCurrency } = useCurrencies();
  const isCredit = type === 'credit';
  const discountAccounts = useMemo(
    () => discountAccountsForNote(accounts, isCredit),
    [accounts, isCredit]
  );

  const defaultDiscount = discountAccounts.find((a) => a.account_code === (isCredit ? '5300' : '4200'))
    || discountAccounts[0];

  const [partyAccountId, setPartyAccountId] = useState('');
  const [discountAccountId, setDiscountAccountId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!currencyId && baseCurrency?.id) setCurrencyId(baseCurrency.id);
  }, [baseCurrency, currencyId]);

  useEffect(() => {
    setDiscountAccountId(defaultDiscount?.id || '');
  }, [defaultDiscount?.id, isCredit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    const numericAmount = Number(amount);
    if (!partyAccountId || !discountAccountId) {
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
      const result = await api.post(isCredit ? '/credit-notes' : '/debit-notes', {
        partyAccountId,
        discountAccountId,
        currencyId,
        amount: numericAmount,
        memo: memo || undefined,
        idempotencyKey,
      });
      setPartyAccountId('');
      setCurrencyId(baseCurrency?.id || '');
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
    <DocumentFormShell
      variant={isCredit ? 'credit' : 'debit'}
      title={isCredit ? t('credit_note_title') : t('debit_note_title')}
      subtitle={isCredit ? t('doc_credit_subtitle') : t('doc_debit_subtitle')}
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
      <DocSection
        title={t('doc_section_party')}
        hint={isCredit ? t('credit_note_hint') : t('debit_note_hint')}
      >
        <PartyAccountSelect
          accounts={accounts}
          value={partyAccountId}
          onChange={setPartyAccountId}
          label={t('party_account')}
          required
        />
        <div className="dc-form-field dc-field-select-md">
          <label>{isCredit ? t('note_discount_allowed') : t('note_discount_earned')}</label>
          <select value={discountAccountId} onChange={(e) => setDiscountAccountId(e.target.value)} required>
            <option value="">{t('voucher_choose_account')}</option>
            {discountAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.account_name}</option>
            ))}
          </select>
          {discountAccounts.length === 0 && (
            <p className="dc-error text-sm">{isCredit ? t('note_discount_allowed_missing') : t('note_discount_earned_missing')}</p>
          )}
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
      </DocSection>
    </DocumentFormShell>
  );
}
