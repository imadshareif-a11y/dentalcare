import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import CheckFields from './CheckFields';
import FormattedDateInput from './FormattedDateInput';
import PartyAccountSelect from './PartyAccountSelect';
import ClinicNumberInput from './ClinicNumberInput';
import PartyVoucherInfo from './PartyVoucherInfo';
import { partyAccounts } from '../lib/partyAccounts';
import { useCurrencies } from '../hooks/useCurrencies';
import { useCashBoxes } from '../hooks/useCashBoxes';
import { useSettings } from '../context/SettingsContext';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyForeignPayment() {
  return { currencyId: '', cashAccountId: '', amount: '', key: newIdempotencyKey() };
}

export default function PaymentForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const { money, currencySymbol } = useSettings();
  const { currencies, baseCurrency } = useCurrencies();
  const { cashBoxes, baseCashBox } = useCashBoxes();
  const payeeAccounts = useMemo(() => {
    const parties = partyAccounts(accounts);
    const expenses = accounts.filter((a) => a.account_type === 'EXPENSE');
    return [...parties, ...expenses];
  }, [accounts]);
  const foreignCashBoxes = useMemo(
    () => cashBoxes.filter((b) => !b.currency_is_base),
    [cashBoxes]
  );

  const [payeeAccountId, setPayeeAccountId] = useState('');
  const [docDate, setDocDate] = useState(todayIso);
  const [shekelAmount, setShekelAmount] = useState('');
  const [includeForeign, setIncludeForeign] = useState(false);
  const [foreignPayments, setForeignPayments] = useState([]);
  const [memo, setMemo] = useState('');
  const [includeChecks, setIncludeChecks] = useState(false);
  const [checkList, setCheckList] = useState([]);
  const [includeExistingChecks, setIncludeExistingChecks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const [pendingChecks, setPendingChecks] = useState([]);
  const [selectedCheckIds, setSelectedCheckIds] = useState(new Set());
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [issuingAccounts, setIssuingAccounts] = useState([]);

  useEffect(() => {
    if (!includeChecks) return;
    Promise.all([
      api.get('/bank-accounts', { kind: 'CURRENT' }),
      api.get('/bank-accounts', { kind: 'PAYMENT' }),
    ])
      .then(([currentRows, paymentRows]) => {
        const merged = [...(currentRows || []), ...(paymentRows || [])]
          .filter((row) => row.is_active !== false);
        const unique = [...new Map(merged.map((row) => [row.id, row])).values()];
        setIssuingAccounts(unique);
      })
      .catch(() => setIssuingAccounts([]));
  }, [includeChecks]);

  useEffect(() => {
    if (!includeExistingChecks) return;
    setLoadingChecks(true);
    api.get('/checks', { status: 'PENDING' })
      .then((data) => setPendingChecks(data.filter((c) => c.check_type === 'RECEIVED')))
      .catch(() => setPendingChecks([]))
      .finally(() => setLoadingChecks(false));
  }, [includeExistingChecks]);

  const filteredChecks = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return pendingChecks.filter((c) => {
      if (q && !`${c.check_number} ${c.bank_name} ${c.drawer_name || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      if (dueFrom && c.due_date < dueFrom) return false;
      if (dueTo && c.due_date > dueTo) return false;
      return true;
    });
  }, [pendingChecks, searchText, dueFrom, dueTo]);

  const selectedTotal = pendingChecks
    .filter((c) => selectedCheckIds.has(c.id))
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const shekelCashNum = Number(shekelAmount) || 0;
  const checksTotal = checkList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  function toggleCheckSelection(id) {
    setSelectedCheckIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function addForeignRow() {
    setForeignPayments((prev) => [...prev, emptyForeignPayment()]);
  }
  function updateForeignRow(index, patch) {
    setForeignPayments((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function removeForeignRow(index) {
    setForeignPayments((prev) => prev.filter((_, i) => i !== index));
  }

  function addCheckRow() {
    setCheckList((prev) => [...prev, {
      idempotencyKey: newIdempotencyKey(),
      currencyId: baseCurrency?.id || '',
      bankAccountId: issuingAccounts.length === 1 ? issuingAccounts[0].id : '',
    }]);
  }
  function updateCheckRow(index, updated) {
    setCheckList((prev) => prev.map((c, i) => (
      i === index ? { ...updated, idempotencyKey: c.idempotencyKey } : c
    )));
  }
  function removeCheckRow(index) {
    setCheckList((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleIncludeChecks(checked) {
    setIncludeChecks(checked);
    if (checked && checkList.length === 0) addCheckRow();
    if (!checked) setCheckList([]);
  }

  function toggleIncludeExistingChecks(checked) {
    setIncludeExistingChecks(checked);
    if (!checked) {
      setSelectedCheckIds(new Set());
      setSearchText('');
      setDueFrom('');
      setDueTo('');
    }
  }

  function toggleIncludeForeign(checked) {
    setIncludeForeign(checked);
    if (checked && foreignPayments.length === 0) addForeignRow();
    if (!checked) setForeignPayments([]);
  }

  function resetForm() {
    setPayeeAccountId('');
    setDocDate(todayIso());
    setShekelAmount('');
    setIncludeForeign(false);
    setForeignPayments([]);
    setMemo('');
    setIncludeChecks(false);
    setCheckList([]);
    setIncludeExistingChecks(false);
    setSelectedCheckIds(new Set());
    setSearchText('');
    setDueFrom('');
    setDueTo('');
    setIdempotencyKey(newIdempotencyKey());
  }

  async function endorseSelectedChecks() {
    const results = [];
    const failures = [];
    for (const checkId of selectedCheckIds) {
      try {
        const result = await api.post(`/checks/${checkId}/endorse`, { payeeAccountId, date: docDate });
        results.push(result);
      } catch (err) {
        failures.push(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      }
    }
    return { results, failures };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!payeeAccountId) {
      setError(t('accounts_required'));
      return;
    }
    if (!docDate) {
      setError(t('voucher_date_required'));
      return;
    }

    const cashPayments = [];
    if (shekelCashNum > 0) {
      if (!baseCashBox?.account_id || !baseCurrency?.id) {
        setError(t('voucher_shekel_box_missing'));
        return;
      }
      cashPayments.push({
        cashAccountId: baseCashBox.account_id,
        currencyId: baseCurrency.id,
        amount: shekelCashNum,
      });
    }

    if (includeForeign) {
      for (const p of foreignPayments) {
        if (!p.currencyId || !p.cashAccountId || !Number(p.amount) || Number(p.amount) <= 0) {
          setError(t('voucher_foreign_payment_incomplete'));
          return;
        }
        if (p.cashAccountId === payeeAccountId) {
          setError(t('accounts_required'));
          return;
        }
        cashPayments.push({
          cashAccountId: p.cashAccountId,
          currencyId: p.currencyId,
          amount: Number(p.amount),
        });
      }
    }

    const hasNewChecks = includeChecks && checkList.length > 0;
    const hasExistingChecks = includeExistingChecks && selectedCheckIds.size > 0;

    if (cashPayments.length === 0 && !hasNewChecks && !hasExistingChecks) {
      setError(t('voucher_payment_amount_required'));
      return;
    }

    if (hasExistingChecks && selectedCheckIds.size === 0) {
      setError(t('payment_endorse_select_required'));
      return;
    }

    if (hasNewChecks) {
      for (const c of checkList) {
        if (issuingAccounts.length > 0 && !c.bankAccountId) {
          setError(t('check_issuing_account_required'));
          return;
        }
        if (!c.checkNumber || !c.bankNumber || !c.bankName || !c.dueDate || !c.currencyId
          || !Number(c.amount) || Number(c.amount) <= 0) {
          setError(t('amount_required'));
          return;
        }
      }
    }

    setSubmitting(true);
    const journalEntryIds = [];
    try {
      if (cashPayments.length > 0 || hasNewChecks) {
        const checksPayload = hasNewChecks
          ? checkList.map(({ imageFront, imageBack, ...rest }) => rest)
          : undefined;

        const result = await api.post('/payments', {
          payeeAccountId,
          date: docDate,
          cashPayments,
          memo,
          idempotencyKey,
          checks: checksPayload,
        });

        journalEntryIds.push(...(result.journalEntryIds || []));
        if (result.journalEntryId) journalEntryIds.push(result.journalEntryId);

        if (hasNewChecks && Array.isArray(result.checks)) {
          for (let i = 0; i < result.checks.length; i += 1) {
            const local = checkList[i];
            const created = result.checks[i];
            if (!created?.id || (!local?.imageFront && !local?.imageBack)) continue;
            const form = new FormData();
            if (local.imageFront) form.append('front', local.imageFront);
            if (local.imageBack) form.append('back', local.imageBack);
            try {
              await api.uploadForm(`/checks/${created.id}/images`, form);
            } catch (uploadErr) {
              console.error('Check image upload failed:', uploadErr);
            }
          }
        }
      }

      if (hasExistingChecks) {
        const { results, failures } = await endorseSelectedChecks();
        if (failures.length > 0) {
          setError(`${failures.length}/${selectedCheckIds.size}: ${failures[0]}`);
          const data = await api.get('/checks', { status: 'PENDING' }).catch(() => []);
          setPendingChecks(data.filter((c) => c.check_type === 'RECEIVED'));
          setSelectedCheckIds(new Set());
          if (journalEntryIds.length > 0) {
            onPosted?.({
              success: true,
              partial: true,
              journalEntryIds: [...new Set(journalEntryIds)],
            });
          }
          return;
        }
        journalEntryIds.push(...results.map((r) => r?.journalEntryId).filter(Boolean));
      }

      resetForm();
      onPosted?.({
        success: true,
        journalEntryIds: [...new Set(journalEntryIds)],
        journalEntryId: journalEntryIds[0],
      });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const documentTotal = shekelCashNum + checksTotal + (includeExistingChecks ? selectedTotal : 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('payment_title')}</h3>

      <div className="dc-form-row dc-voucher-head-row">
        <PartyAccountSelect
          accountList={payeeAccounts}
          value={payeeAccountId}
          onChange={setPayeeAccountId}
          label={t('party_account')}
          required
          pickerScope="extended"
        />
        <div className="dc-form-field dc-field-date dc-voucher-date-col">
          <PartyVoucherInfo accountId={payeeAccountId} />
          <label>{t('voucher_date')}</label>
          <FormattedDateInput value={docDate} onChange={setDocDate} required />
        </div>
      </div>

      <div className="dc-form-row">
        <div className="dc-form-field dc-field-amount">
          <label>{t('voucher_cash_amount')}</label>
          <ClinicNumberInput
            showCurrency
            currencySymbol={baseCurrency?.symbol || currencySymbol}
            extraTag={baseCashBox?.name || t('voucher_shekel_cash_box')}
            min="0"
            step="0.01"
            value={shekelAmount}
            onChange={setShekelAmount}
            placeholder={t('voucher_cash_amount_optional')}
          />
        </div>
      </div>

      <label className="dc-check-row">
        <input
          type="checkbox"
          checked={includeForeign}
          onChange={(e) => toggleIncludeForeign(e.target.checked)}
        />
        {t('voucher_other_currencies')}
      </label>

      {includeForeign && (
        <div className="space-y-2">
          {foreignPayments.map((p, i) => {
            const boxesForCurrency = foreignCashBoxes.filter((b) => b.currency_id === p.currencyId);
            return (
              <div key={p.key} className="dc-form-row dc-foreign-cash-row">
                <select
                  value={p.currencyId}
                  onChange={(e) => {
                    const currencyId = e.target.value;
                    const firstBox = foreignCashBoxes.find((b) => b.currency_id === currencyId);
                    updateForeignRow(i, {
                      currencyId,
                      cashAccountId: firstBox?.account_id || '',
                    });
                  }}
                  required
                >
                  <option value="">{t('doc_currency_choose')}</option>
                  {[...new Map(foreignCashBoxes.map((b) => [b.currency_id, b])).values()].map((b) => (
                    <option key={b.currency_id} value={b.currency_id}>
                      {b.currency_code} — {b.currency_symbol}
                    </option>
                  ))}
                </select>
                <ClinicNumberInput
                  showCurrency
                  currencySymbol={
                    foreignCashBoxes.find((b) => b.currency_id === p.currencyId)?.currency_symbol
                    || currencies.find((c) => c.id === p.currencyId)?.symbol
                    || currencySymbol
                  }
                  min="0"
                  step="0.01"
                  placeholder={t('amount')}
                  value={p.amount}
                  onChange={(amount) => updateForeignRow(i, { amount })}
                  required
                />
                <select
                  value={p.cashAccountId}
                  onChange={(e) => updateForeignRow(i, { cashAccountId: e.target.value })}
                  required
                >
                  <option value="">{t('voucher_currency_cash_box')}</option>
                  {boxesForCurrency.map((b) => (
                    <option key={b.id} value={b.account_id}>{b.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeForeignRow(i)}>×</button>
              </div>
            );
          })}
          <button type="button" onClick={addForeignRow}>{t('voucher_add_foreign_payment')}</button>
        </div>
      )}

      <label className="dc-check-row">
        <input type="checkbox" checked={includeChecks} onChange={(e) => toggleIncludeChecks(e.target.checked)} />
        {t('paid_by_check')}
      </label>

      {includeChecks && (
        <div className="space-y-2">
          {checkList.map((c, i) => (
            <div key={c.idempotencyKey || i} className="dc-check-row-wrap">
              <CheckFields
                check={c}
                onChange={(updated) => updateCheckRow(i, updated)}
                showAmount
                currencies={currencies}
                showIssuingAccount={issuingAccounts.length > 0}
                issuingBankAccounts={issuingAccounts}
              />
              <button type="button" onClick={() => removeCheckRow(i)}>×</button>
            </div>
          ))}
          <button type="button" onClick={addCheckRow}>{t('check_add')}</button>
          <div>{t('checks_total')}: {money(checksTotal)}</div>
        </div>
      )}

      <label className="dc-check-row">
        <input
          type="checkbox"
          checked={includeExistingChecks}
          onChange={(e) => toggleIncludeExistingChecks(e.target.checked)}
        />
        {t('paid_by_existing_check')}
      </label>

      {includeExistingChecks && (
        <div className="space-y-2">
          <p className="dc-muted text-sm">{t('payment_endorse_hint')}</p>
          <div className="dc-form-row">
            <input
              type="text" placeholder={t('check_search_placeholder')}
              value={searchText} onChange={(e) => setSearchText(e.target.value)}
            />
            <label>
              {t('check_filter_due_from')}
              <FormattedDateInput value={dueFrom} onChange={setDueFrom} />
            </label>
            <label>
              {t('check_filter_due_to')}
              <FormattedDateInput value={dueTo} onChange={setDueTo} />
            </label>
          </div>

          {loadingChecks && <div>{t('ledger_loading')}</div>}
          {!loadingChecks && pendingChecks.length === 0 && <div>{t('no_pending_checks_available')}</div>}
          {!loadingChecks && pendingChecks.length > 0 && filteredChecks.length === 0 && (
            <div>{t('check_no_results')}</div>
          )}

          {!loadingChecks && filteredChecks.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th />
                  <th>{t('check_col_number')}</th>
                  <th>{t('check_col_bank')}</th>
                  <th>{t('check_col_drawer')}</th>
                  <th>{t('check_col_due')}</th>
                  <th>{t('check_col_amount')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredChecks.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedCheckIds.has(c.id)}
                        onChange={() => toggleCheckSelection(c.id)}
                      />
                    </td>
                    <td>{c.check_number}</td>
                    <td>{c.bank_name}</td>
                    <td>{c.drawer_name || '—'}</td>
                    <td>{c.due_date}</td>
                    <td className="dc-money">{money(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedCheckIds.size > 0 && (
            <div>{t('check_selected_count', { count: selectedCheckIds.size, total: money(selectedTotal) })}</div>
          )}
        </div>
      )}

      <input
        type="text" placeholder={t('voucher_memo')}
        className="dc-field-memo"
        value={memo} onChange={(e) => setMemo(e.target.value)}
      />

      {documentTotal > 0 && (
        <div className="dc-muted text-sm">
          {t('voucher_document_total')}: {money(documentTotal)}
        </div>
      )}

      {error && <div className="dc-error">{error}</div>}

      <button type="submit" className="dc-danger" disabled={submitting}>
        {submitting ? t('saving_voucher') : t('save_voucher')}
      </button>
    </form>
  );
}
