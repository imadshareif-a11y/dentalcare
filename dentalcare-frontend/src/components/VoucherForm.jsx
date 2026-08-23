// components/VoucherForm.jsx
// -----------------------------------------------------------
// قيد يومية — عملة كل سطر = عملة الحساب (صندوق/بنك/أساس).
// المستخدم يُدخل بالعملة الأجنبية؛ المعادل بالعملة الأساسية يُحسب تلقائياً.
// -----------------------------------------------------------

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import ClinicNumberInput from './ClinicNumberInput';
import PartyAccountSelect from './PartyAccountSelect';
import { useCurrencies } from '../hooks/useCurrencies';
import { useCashBoxes } from '../hooks/useCashBoxes';
import { useSettings } from '../context/SettingsContext';
import { accountOptionLabel, accountSearchText } from '../lib/partyAccounts';

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function toBaseAmount(foreign, rate) {
  return roundMoney((Number(foreign) || 0) * (Number(rate) || 1));
}

function emptyLine(baseCurrency) {
  return {
    accountId: '',
    debit: '',
    credit: '',
    lineMemo: '',
    currencyId: baseCurrency?.id || '',
    currencyCode: baseCurrency?.code || '',
    currencySymbol: baseCurrency?.symbol || '',
    exchangeRate: 1,
  };
}

function isLineComplete(line) {
  if (!line?.accountId) return false;
  return (Number(line.debit) || 0) > 0 || (Number(line.credit) || 0) > 0;
}

function accountCurrencyFromList(account, baseCurrency) {
  if (!account) return emptyLine(baseCurrency);
  return {
    currencyId: account.currency_id || baseCurrency?.id || '',
    currencyCode: account.currency_code || baseCurrency?.code || '',
    currencySymbol: account.currency_symbol || baseCurrency?.symbol || '',
    exchangeRate: Number(account.exchange_rate) > 0 ? Number(account.exchange_rate) : 1,
  };
}

function currencyMetaFromId(currencyId, currencies, baseCurrency) {
  const cur = currencies.find((c) => String(c.id) === String(currencyId));
  if (!cur) return emptyLine(baseCurrency);
  return {
    currencyId: cur.id,
    currencyCode: cur.code,
    currencySymbol: cur.symbol,
    exchangeRate: Number(cur.rate_to_base) > 0 ? Number(cur.rate_to_base) : 1,
  };
}

export default function VoucherForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const { currencies, baseCurrency } = useCurrencies();
  const { boxes: cashBoxes } = useCashBoxes();
  const [bankAccounts, setBankAccounts] = useState([]);
  const [lines, setLines] = useState([emptyLine(null)]);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const lineAccountRefs = useRef([]);

  const accountMap = useMemo(
    () => new Map(accounts.map((a) => [String(a.id), a])),
    [accounts]
  );

  useEffect(() => {
    let cancelled = false;
    api.get('/bank-accounts')
      .then((rows) => {
        if (!cancelled) setBankAccounts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setBankAccounts([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!baseCurrency?.id) return;
    setLines((prev) => prev.map((line) => (
      line.accountId ? line : { ...line, ...emptyLine(baseCurrency) }
    )));
  }, [baseCurrency?.id]);

  const accountCurrencyMap = useMemo(() => {
    const map = new Map();
    for (const box of cashBoxes) {
      if (!box.account_id || box.is_active === false) continue;
      map.set(String(box.account_id), currencyMetaFromId(box.currency_id, currencies, baseCurrency));
    }
    for (const bank of bankAccounts) {
      if (!bank.chart_account_id || bank.is_active === false) continue;
      map.set(String(bank.chart_account_id), currencyMetaFromId(bank.currency_id, currencies, baseCurrency));
    }
    for (const account of accounts) {
      if (!account?.id || !account.currency_id) continue;
      if (!map.has(String(account.id))) {
        map.set(String(account.id), accountCurrencyFromList(account, baseCurrency));
      }
    }
    return map;
  }, [cashBoxes, bankAccounts, accounts, currencies, baseCurrency]);

  function resolveAccountCurrency(accountId) {
    const fromMap = accountCurrencyMap.get(String(accountId));
    if (fromMap?.currencyId) return fromMap;
    const account = accountMap.get(String(accountId));
    if (account?.currency_id) return accountCurrencyFromList(account, baseCurrency);
    return emptyLine(baseCurrency);
  }

  const accountOptions = useMemo(() => accounts.map((a) => {
    const cur = accountCurrencyMap.get(String(a.id));
    const code = a.currency_code || cur?.currencyCode || '';
    const label = accountOptionLabel(a, t);
    return {
      ...a,
      pickerCurrency: code,
      pickerLabel: code ? `${label} (${code})` : label,
      pickerSearch: accountSearchText(a, t),
    };
  }), [accounts, accountCurrencyMap, t]);

  const computedLines = useMemo(() => lines.map((line) => {
    const foreignDebit = Number(line.debit) || 0;
    const foreignCredit = Number(line.credit) || 0;
    const rate = Number(line.exchangeRate) || 1;
    return {
      ...line,
      baseDebit: toBaseAmount(foreignDebit, rate),
      baseCredit: toBaseAmount(foreignCredit, rate),
    };
  }), [lines]);

  const { totalBaseDebit, totalBaseCredit, diff } = useMemo(() => {
    const d = computedLines.reduce((s, l) => s + l.baseDebit, 0);
    const c = computedLines.reduce((s, l) => s + l.baseCredit, 0);
    return {
      totalBaseDebit: roundMoney(d),
      totalBaseCredit: roundMoney(c),
      diff: roundMoney(d - c),
    };
  }, [computedLines]);

  const isBalanced = diff === 0 && totalBaseDebit > 0;
  const baseSymbol = baseCurrency?.symbol || '₪';

  function updateLine(index, patch) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function onAccountChange(index, accountId) {
    const cur = resolveAccountCurrency(accountId);
    updateLine(index, { accountId, ...cur });
  }

  const focusLineAccount = useCallback((index) => {
    window.setTimeout(() => {
      lineAccountRefs.current[index]?.focus?.();
    }, 0);
  }, []);

  const tryAdvanceLine = useCallback((index, e) => {
    const line = lines[index];
    if (!isLineComplete(line)) return false;

    if (e) e.preventDefault();

    if (index < lines.length - 1) {
      focusLineAccount(index + 1);
      return true;
    }

    setLines((prev) => [...prev, emptyLine(baseCurrency)]);
    focusLineAccount(index + 1);
    return true;
  }, [lines, baseCurrency, focusLineAccount]);

  function addLineManual() {
    setLines((prev) => [...prev, emptyLine(baseCurrency)]);
    focusLineAccount(lines.length);
  }

  function removeLine(index) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
    lineAccountRefs.current.splice(index, 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!isBalanced) {
      setError(t('voucher_unbalanced_base', { diff: Math.abs(diff), symbol: baseSymbol }));
      return;
    }

    const payloadLines = computedLines
      .filter((l) => l.accountId && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0))
      .map((l) => ({
        accountId: l.accountId,
        foreignDebit: Number(l.debit) || 0,
        foreignCredit: Number(l.credit) || 0,
        currencyId: l.currencyId,
        exchangeRate: Number(l.exchangeRate) || 1,
        lineMemo: l.lineMemo,
      }));

    if (payloadLines.length < 2) {
      setError(t('voucher_min_two_lines'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post('/journal-entries', {
        memo,
        idempotencyKey,
        lines: payloadLines,
      });

      setLines([emptyLine(baseCurrency)]);
      lineAccountRefs.current = [];
      setMemo('');
      setIdempotencyKey(newIdempotencyKey());
      onPosted?.(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body?.error || err.message);
      } else {
        setError(t('error_network'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="dc-voucher-form space-y-3">
      <p className="dc-muted text-sm">{t('voucher_multi_currency_hint')}</p>
      <p className="dc-muted text-sm">{t('voucher_line_nav_hint')}</p>

      <div className="dc-voucher-table-wrap">
        <table className="dc-voucher-table text-sm">
          <thead>
            <tr>
              <th>{t('voucher_choose_account')}</th>
              <th>{t('voucher_debit_foreign')}</th>
              <th>{t('voucher_credit_foreign')}</th>
              <th>{t('voucher_line_currency')}</th>
              <th>{t('voucher_exchange_rate')}</th>
              <th>{t('voucher_debit_base', { symbol: baseSymbol })}</th>
              <th>{t('voucher_credit_base', { symbol: baseSymbol })}</th>
              <th>{t('voucher_line_memo')}</th>
              <th aria-label={t('check_col_actions')} />
            </tr>
          </thead>
          <tbody>
            {computedLines.map((line, i) => (
              <tr key={i}>
                <td className="dc-voucher-account-cell">
                  <PartyAccountSelect
                    accounts={accounts}
                    accountList={accountOptions}
                    value={line.accountId}
                    onChange={(accountId) => onAccountChange(i, accountId)}
                    required
                    compact
                    hideHint
                    pickerScope="extended"
                    fieldClassName="dc-voucher-account-field"
                    inputRef={(el) => { lineAccountRefs.current[i] = el; }}
                  />
                </td>
                <td>
                  <ClinicNumberInput
                    showCurrency
                    currencySymbol={line.currencySymbol || baseSymbol}
                    min="0"
                    step="0.01"
                    value={line.debit}
                    onChange={(debit) => updateLine(i, { debit, credit: debit ? '' : line.credit })}
                  />
                </td>
                <td>
                  <ClinicNumberInput
                    showCurrency
                    currencySymbol={line.currencySymbol || baseSymbol}
                    min="0"
                    step="0.01"
                    value={line.credit}
                    onChange={(credit) => updateLine(i, { credit, debit: credit ? '' : line.debit })}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') tryAdvanceLine(i, e);
                    }}
                  />
                </td>
                <td className="dc-voucher-currency-cell">
                  <span className="dc-voucher-currency-badge">
                    {line.currencyCode || baseCurrency?.code || '—'}
                  </span>
                </td>
                <td className="dc-num dc-voucher-rate-cell">
                  {(Number(line.exchangeRate) || 1).toFixed(4)}
                </td>
                <td className="dc-money dc-voucher-base-cell">
                  {line.baseDebit > 0 ? money(line.baseDebit) : '—'}
                </td>
                <td className="dc-money dc-voucher-base-cell">
                  {line.baseCredit > 0 ? money(line.baseCredit) : '—'}
                </td>
                <td>
                  <input
                    type="text"
                    value={line.lineMemo}
                    onChange={(e) => updateLine(i, { lineMemo: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key !== 'Tab' && e.key !== 'ArrowDown') return;
                      if (e.key === 'Tab' && e.shiftKey) return;
                      tryAdvanceLine(i, e);
                    }}
                    placeholder={t('voucher_line_memo')}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="dc-ghost-light"
                    onClick={() => removeLine(i)}
                    disabled={lines.length <= 1}
                    title={t('voucher_remove_line')}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="dc-voucher-totals-row">
              <td colSpan={5}><strong>{t('trial_balance_totals')}</strong></td>
              <td className="dc-money"><strong>{money(totalBaseDebit)}</strong></td>
              <td className="dc-money"><strong>{money(totalBaseCredit)}</strong></td>
              <td colSpan={2} className={isBalanced ? 'text-emerald-700' : 'text-rose-700'}>
                {!isBalanced && totalBaseDebit + totalBaseCredit > 0 && (
                  <span>{t('voucher_diff')}: {money(Math.abs(diff))}</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <button type="button" className="dc-voucher-add-line-btn" onClick={addLineManual}>
        <i className="fa-solid fa-plus" aria-hidden="true" />
        {t('voucher_add_line')}
      </button>

      <input
        type="text"
        className="dc-field-memo"
        placeholder={t('voucher_memo')}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      {error && <div className="text-rose-700 font-bold">{error}</div>}

      <button type="submit" disabled={!isBalanced || submitting}>
        {submitting ? t('voucher_saving') : t('voucher_save')}
      </button>
    </form>
  );
}
