import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import PartyAccountSelect from './PartyAccountSelect';
import CurrencySelect from './CurrencySelect';
import ClinicNumberInput from './ClinicNumberInput';
import { useCurrencies } from '../hooks/useCurrencies';

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
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{isCredit ? t('credit_note_title') : t('debit_note_title')}</h3>
      <p className="dc-muted text-sm">{isCredit ? t('credit_note_hint') : t('debit_note_hint')}</p>
      <PartyAccountSelect
        accounts={accounts}
        value={partyAccountId}
        onChange={setPartyAccountId}
        label={t('party_account')}
        required
      />
      <div>
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
      {error && <div className="dc-error">{error}</div>}
      <button type="submit" className="dc-success" disabled={submitting}>
        {submitting ? t('saving_voucher') : t('save_voucher')}
      </button>
    </form>
  );
}
