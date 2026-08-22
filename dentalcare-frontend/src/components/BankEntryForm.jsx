import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import FormattedDateInput from './FormattedDateInput';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';
import PartyAccountSelect from './PartyAccountSelect';
import { partyAccounts } from '../lib/partyAccounts';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BankEntryForm({ accounts, onPosted }) {
  const { t, i18n } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();

  const [bankAccounts, setBankAccounts] = useState([]);
  const [boxChecks, setBoxChecks] = useState([]);
  const [operation, setOperation] = useState('TRANSFER');
  const [docDate, setDocDate] = useState(todayIso);
  const [currencyId, setCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [fromBankAccountId, setFromBankAccountId] = useState('');
  const [toBankAccountId, setToBankAccountId] = useState('');
  const [counterpartAccountId, setCounterpartAccountId] = useState('');
  const [selectedCheckIds, setSelectedCheckIds] = useState([]);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    api.get('/bank-accounts')
      .then((rows) => setBankAccounts(Array.isArray(rows) ? rows.filter((r) => r.is_active !== false) : []))
      .catch(() => setBankAccounts([]));
  }, []);

  useEffect(() => {
    if (operation !== 'CHECK_DEPOSIT') return;
    api.get('/checks?status=PENDING&location=CHECKS_BOX')
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setBoxChecks(list.filter((c) => c.check_type === 'RECEIVED'));
      })
      .catch(() => setBoxChecks([]));
  }, [operation]);

  useEffect(() => {
    if (!currencyId && baseCurrency?.id) setCurrencyId(baseCurrency.id);
  }, [baseCurrency, currencyId]);

  useEffect(() => {
    setFromBankAccountId('');
    setToBankAccountId('');
    setCounterpartAccountId('');
    setSelectedCheckIds([]);
    setAmount('');
    setError(null);
  }, [operation]);

  const collectionBanks = useMemo(
    () => bankAccounts.filter((b) => b.account_kind === 'COLLECTION'),
    [bankAccounts]
  );

  const depositTotal = useMemo(() => {
    const set = new Set(selectedCheckIds);
    return boxChecks
      .filter((c) => set.has(c.id))
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  }, [boxChecks, selectedCheckIds]);

  const counterpartOptions = useMemo(() => {
    const parties = partyAccounts(accounts);
    const expenses = accounts.filter((a) => a.account_type === 'EXPENSE');
    const revenues = accounts.filter((a) => a.account_type === 'REVENUE');
    const bankChartIds = new Set(bankAccounts.map((b) => b.chart_account_id));
    const otherAssets = accounts.filter(
      (a) => a.account_type === 'ASSET' && !a.party_type && !bankChartIds.has(a.id)
    );
    return [...parties, ...expenses, ...revenues, ...otherAssets];
  }, [accounts, bankAccounts]);

  function bankLabel(row) {
    const lang = i18n.language;
    let name = row.name;
    if (lang === 'en' && row.name_en) name = row.name_en;
    if (lang === 'he' && row.name_he) name = row.name_he;
    const bank = row.bank_number ? `${row.bank_number} ` : '';
    return `${row.account_code} — ${name}${bank ? ` (${bank}${row.bank_name || ''})` : ''}`;
  }

  function toggleCheck(id) {
    setSelectedCheckIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  }

  function resetForm() {
    setOperation('TRANSFER');
    setDocDate(todayIso());
    setCurrencyId(baseCurrency?.id || '');
    setAmount('');
    setFromBankAccountId('');
    setToBankAccountId('');
    setCounterpartAccountId('');
    setSelectedCheckIds([]);
    setMemo('');
    setIdempotencyKey(newIdempotencyKey());
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!docDate) {
      setError(t('voucher_date_required'));
      return;
    }

    if (operation === 'CHECK_DEPOSIT') {
      if (selectedCheckIds.length === 0) {
        setError(t('bank_entry_checks_required'));
        return;
      }
      if (!toBankAccountId) {
        setError(t('bank_entry_collection_required'));
        return;
      }

      setSubmitting(true);
      try {
        const result = await api.post('/bank-entries', {
          operation: 'CHECK_DEPOSIT',
          date: docDate,
          memo: memo.trim() || undefined,
          idempotencyKey,
          toBankAccountId,
          checkIds: selectedCheckIds,
        });
        resetForm();
        onPosted?.(result);
      } catch (err) {
        setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!currencyId) {
      setError(t('doc_currency_required'));
      return;
    }
    if (!Number(amount) || Number(amount) <= 0) {
      setError(t('amount_required'));
      return;
    }

    if (operation === 'TRANSFER') {
      if (!fromBankAccountId || !toBankAccountId) {
        setError(t('bank_entry_banks_required'));
        return;
      }
      if (fromBankAccountId === toBankAccountId) {
        setError(t('bank_entry_same_bank'));
        return;
      }
    } else if (operation === 'INCOMING') {
      if (!toBankAccountId || !counterpartAccountId) {
        setError(t('bank_entry_incoming_required'));
        return;
      }
    } else if (!fromBankAccountId || !counterpartAccountId) {
      setError(t('bank_entry_outgoing_required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/bank-entries', {
        operation,
        amount: Number(amount),
        currencyId,
        date: docDate,
        memo: memo.trim() || undefined,
        idempotencyKey,
        fromBankAccountId: fromBankAccountId || undefined,
        toBankAccountId: toBankAccountId || undefined,
        counterpartAccountId: counterpartAccountId || undefined,
      });
      resetForm();
      onPosted?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('bank_entry_title')}</h3>
      <p className="dc-muted text-sm">{t('bank_entry_hint')}</p>

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('bank_entry_operation')}</label>
          <select value={operation} onChange={(e) => setOperation(e.target.value)}>
            <option value="TRANSFER">{t('bank_entry_op_transfer')}</option>
            <option value="INCOMING">{t('bank_entry_op_incoming')}</option>
            <option value="OUTGOING">{t('bank_entry_op_outgoing')}</option>
            <option value="CHECK_DEPOSIT">{t('bank_entry_op_check_deposit')}</option>
          </select>
        </div>
        <div className="dc-form-field">
          <label>{t('voucher_date')}</label>
          <FormattedDateInput value={docDate} onChange={setDocDate} required />
        </div>
      </div>

      {operation === 'CHECK_DEPOSIT' ? (
        <>
          <div className="dc-form-field">
            <label>{t('bank_entry_collection_bank')}</label>
            <select
              value={toBankAccountId}
              onChange={(e) => setToBankAccountId(e.target.value)}
              required
            >
              <option value="">{t('voucher_choose_account')}</option>
              {collectionBanks.map((b) => (
                <option key={b.id} value={b.id}>{bankLabel(b)}</option>
              ))}
            </select>
            {collectionBanks.length === 0 && (
              <p className="dc-muted text-sm">{t('bank_entry_no_collection')}</p>
            )}
          </div>

          <div className="dc-form-field">
            <label>{t('bank_entry_select_checks')}</label>
            {boxChecks.length === 0 ? (
              <p className="dc-muted text-sm">{t('bank_entry_no_box_checks')}</p>
            ) : (
              <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #ddd', padding: 8 }}>
                {boxChecks.map((c) => (
                  <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <input
                      type="checkbox"
                      checked={selectedCheckIds.includes(c.id)}
                      onChange={() => toggleCheck(c.id)}
                    />
                    <span>
                      {c.check_number} — {c.bank_name} — {Number(c.amount).toFixed(2)}
                      {c.due_date ? ` (${c.due_date})` : ''}
                      {c.cash_box_name ? ` · ${c.cash_box_name}` : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {selectedCheckIds.length > 0 && (
              <p className="text-sm">{t('bank_entry_deposit_total')}: {depositTotal.toFixed(2)}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="dc-form-row">
            <div className="dc-form-field">
              <CurrencySelect value={currencyId} onChange={setCurrencyId} currencies={currencies} />
            </div>
            <div className="dc-form-field">
              <label>{t('amount')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          {(operation === 'TRANSFER' || operation === 'OUTGOING') && (
            <div className="dc-form-field">
              <label>{t('bank_entry_from_bank')}</label>
              <select
                value={fromBankAccountId}
                onChange={(e) => setFromBankAccountId(e.target.value)}
                required
              >
                <option value="">{t('voucher_choose_account')}</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{bankLabel(b)}</option>
                ))}
              </select>
            </div>
          )}

          {(operation === 'TRANSFER' || operation === 'INCOMING') && (
            <div className="dc-form-field">
              <label>{t('bank_entry_to_bank')}</label>
              <select
                value={toBankAccountId}
                onChange={(e) => setToBankAccountId(e.target.value)}
                required
              >
                <option value="">{t('voucher_choose_account')}</option>
                {bankAccounts.map((b) => (
                  <option key={b.id} value={b.id}>{bankLabel(b)}</option>
                ))}
              </select>
            </div>
          )}

          {(operation === 'INCOMING' || operation === 'OUTGOING') && (
            <PartyAccountSelect
              accountList={counterpartOptions}
              value={counterpartAccountId}
              onChange={setCounterpartAccountId}
              label={t('bank_entry_counterpart')}
              required
            />
          )}
        </>
      )}

      <input
        type="text"
        placeholder={t('voucher_memo')}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      {error && <div className="dc-error">{error}</div>}

      <button type="submit" className="dc-success" disabled={submitting}>
        {submitting ? t('saving_voucher') : t('bank_entry_save')}
      </button>
    </form>
  );
}
