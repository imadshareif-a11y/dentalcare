import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import CurrencySelect from './CurrencySelect';
import ClinicNumberInput from './ClinicNumberInput';
import { useCurrencies } from '../hooks/useCurrencies';
import { useSettings } from '../context/SettingsContext';
import PartyAccountSelect from './PartyAccountSelect';
import DocPartyDateRow from './DocPartyDateRow';
import DocumentFormShell, { DocSection, DocTotalBar } from './DocumentFormShell';
import { partyAccounts } from '../lib/partyAccounts';
import { useDocumentDraftBinding } from '../hooks/useDocumentDraftBinding';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BankEntryForm({ accounts, onPosted, draft, registerDraftHandlers }) {
  const { t, i18n } = useTranslation();
  const { money } = useSettings();
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

  const getPayload = useCallback(() => ({
    operation,
    docDate,
    currencyId,
    amount,
    fromBankAccountId,
    toBankAccountId,
    counterpartAccountId,
    selectedCheckIds,
    memo,
    idempotencyKey,
  }), [
    operation, docDate, currencyId, amount, fromBankAccountId, toBankAccountId,
    counterpartAccountId, selectedCheckIds, memo, idempotencyKey,
  ]);

  const applyPayload = useCallback((p) => {
    if (p.operation) setOperation(p.operation);
    if (p.docDate) setDocDate(p.docDate);
    if (p.currencyId) setCurrencyId(p.currencyId);
    if (p.amount != null) setAmount(String(p.amount));
    if (p.fromBankAccountId != null) setFromBankAccountId(p.fromBankAccountId);
    if (p.toBankAccountId != null) setToBankAccountId(p.toBankAccountId);
    if (p.counterpartAccountId != null) setCounterpartAccountId(p.counterpartAccountId);
    if (Array.isArray(p.selectedCheckIds)) setSelectedCheckIds(p.selectedCheckIds);
    if (p.memo != null) setMemo(p.memo);
    if (p.idempotencyKey) setIdempotencyKey(p.idempotencyKey);
  }, []);

  const getSummary = useCallback(() => {
    const opKeys = {
      TRANSFER: 'bank_entry_op_transfer',
      INCOMING: 'bank_entry_op_incoming',
      OUTGOING: 'bank_entry_op_outgoing',
      CHECK_DEPOSIT: 'bank_entry_op_check_deposit',
    };
    const opLabel = t(opKeys[operation] || 'bank_entry_operation');
    const total = operation === 'CHECK_DEPOSIT' ? depositTotal : Number(amount) || 0;
    const amt = total > 0 ? money(total) : '';
    return [opLabel, amt, memo].filter(Boolean).join(' — ').slice(0, 500);
  }, [operation, depositTotal, amount, memo, money, t]);

  useDocumentDraftBinding({
    registerDraftHandlers,
    draft,
    getPayload,
    applyPayload,
    getSummary,
  });

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
    <DocumentFormShell
      variant="bank"
      title={t('bank_entry_title')}
      subtitle={t('doc_bank_subtitle')}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      submitLabel={t('bank_entry_save')}
      totals={(operation === 'CHECK_DEPOSIT' ? depositTotal : Number(amount) || 0) > 0 ? (
        <DocTotalBar
          highlight={{
            label: operation === 'CHECK_DEPOSIT' ? t('bank_entry_deposit_total') : t('voucher_document_total'),
            value: money(operation === 'CHECK_DEPOSIT' ? depositTotal : Number(amount) || 0),
          }}
        />
      ) : null}
    >
      <DocSection title={t('doc_section_party')} hint={t('bank_entry_hint')}>
        <DocPartyDateRow
          docDate={docDate}
          onDateChange={setDocDate}
          showPartyInfo={false}
        >
          <div className="dc-form-field dc-field-party dc-bank-op-field">
            <label>{t('bank_entry_operation')}</label>
            <div className="dc-doc-op-pills" role="tablist">
              {[
                { id: 'TRANSFER', label: t('bank_entry_op_transfer') },
                { id: 'INCOMING', label: t('bank_entry_op_incoming') },
                { id: 'OUTGOING', label: t('bank_entry_op_outgoing') },
                { id: 'CHECK_DEPOSIT', label: t('bank_entry_op_check_deposit') },
              ].map((op) => (
                <button
                  key={op.id}
                  type="button"
                  role="tab"
                  className={`dc-doc-op-pill${operation === op.id ? ' is-active' : ''}`}
                  aria-selected={operation === op.id}
                  onClick={() => setOperation(op.id)}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        </DocPartyDateRow>
        {(operation === 'INCOMING' || operation === 'OUTGOING') && (
          <PartyAccountSelect
            accountList={counterpartOptions}
            value={counterpartAccountId}
            onChange={setCounterpartAccountId}
            label={t('bank_entry_counterpart')}
            required
            pickerScope="extended"
          />
        )}
      </DocSection>

      {operation === 'CHECK_DEPOSIT' ? (
        <DocSection title={t('doc_section_amount')}>
          <div className="dc-doc-panel">
            <div className="dc-form-field dc-field-party">
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
                <div className="dc-doc-check-list">
                  {boxChecks.map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={selectedCheckIds.includes(c.id)}
                        onChange={() => toggleCheck(c.id)}
                      />
                      <span>
                        {c.check_number} — {c.bank_name} — {money(c.amount)}
                        {c.due_date ? ` (${c.due_date})` : ''}
                        {c.cash_box_name ? ` · ${c.cash_box_name}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DocSection>
      ) : (
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

          <div className="dc-doc-panel">
            {(operation === 'TRANSFER' || operation === 'OUTGOING') && (
              <div className="dc-form-field dc-field-party">
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
              <div className="dc-form-field dc-field-party">
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
          </div>
        </DocSection>
      )}

      <DocSection title={t('doc_section_details')}>
        <input
          type="text"
          className="dc-field-memo"
          placeholder={t('voucher_memo')}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </DocSection>
    </DocumentFormShell>
  );
}
