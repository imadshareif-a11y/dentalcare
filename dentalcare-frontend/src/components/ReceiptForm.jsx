import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import CheckFields from './CheckFields';
import FormattedDateInput from './FormattedDateInput';
import { partyAccounts, formatPartyOption } from '../lib/partyAccounts';
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

export default function ReceiptForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { currencies, baseCurrency } = useCurrencies();
  const { cashBoxes, baseCashBox } = useCashBoxes();
  const partyList = partyAccounts(accounts);
  const waEnabled = Boolean(settings?.waEnabled);
  const waAutoPayment = Boolean(settings?.waAutoPayment);
  const foreignCashBoxes = useMemo(
    () => cashBoxes.filter((b) => !b.currency_is_base),
    [cashBoxes]
  );

  const [patientAccountId, setPatientAccountId] = useState('');
  const [docDate, setDocDate] = useState(todayIso);
  const [shekelAmount, setShekelAmount] = useState('');
  const [includeForeign, setIncludeForeign] = useState(false);
  const [foreignPayments, setForeignPayments] = useState([]);
  const [memo, setMemo] = useState('');
  const [includeChecks, setIncludeChecks] = useState(false);
  const [checkList, setCheckList] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [sendWaConfirm, setSendWaConfirm] = useState(false);

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

  function toggleIncludeForeign(checked) {
    setIncludeForeign(checked);
    if (checked && foreignPayments.length === 0) addForeignRow();
    if (!checked) setForeignPayments([]);
  }

  const shekelCashNum = Number(shekelAmount) || 0;
  const foreignTotal = foreignPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const checksTotal = checkList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!patientAccountId) {
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
        cashPayments.push({
          cashAccountId: p.cashAccountId,
          currencyId: p.currencyId,
          amount: Number(p.amount),
        });
      }
    }

    const hasChecks = includeChecks && checkList.length > 0;
    if (cashPayments.length === 0 && !hasChecks) {
      setError(t('voucher_cash_or_check_required'));
      return;
    }

    if (hasChecks) {
      for (const c of checkList) {
        if (!c.checkNumber || !c.bankNumber || !c.bankName || !c.dueDate || !c.currencyId
          || !Number(c.amount) || Number(c.amount) <= 0) {
          setError(t('amount_required'));
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      // لا تُرسل ملفات الصور مع JSON
      const checksPayload = hasChecks
        ? checkList.map(({ imageFront, imageBack, ...rest }) => rest)
        : undefined;

      const result = await api.post('/receipts', {
        patientAccountId,
        date: docDate,
        cashPayments,
        memo,
        idempotencyKey,
        checks: checksPayload,
      });

      if (hasChecks && Array.isArray(result.checks)) {
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

      setPatientAccountId('');
      setDocDate(todayIso());
      setShekelAmount('');
      setIncludeForeign(false);
      setForeignPayments([]);
      setMemo('');
      setIncludeChecks(false);
      setCheckList([]);
      setIdempotencyKey(newIdempotencyKey());

      if (waEnabled && !waAutoPayment && sendWaConfirm) {
        try {
          await api.post('/whatsapp/send', {
            kind: 'payment',
            patientAccountId,
            amount: shekelCashNum + foreignTotal + checksTotal,
            entryDate: docDate,
            skipDedupe: true,
          });
        } catch (waErr) {
          console.error('WhatsApp payment confirm failed:', waErr);
        }
      }
      setSendWaConfirm(false);
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

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('party_account')}</label>
          <select value={patientAccountId} onChange={(e) => setPatientAccountId(e.target.value)} required>
            <option value="">{t('voucher_choose_account')}</option>
            {partyList.map((a) => (
              <option key={a.id} value={a.id}>{formatPartyOption(a, t)}</option>
            ))}
          </select>
        </div>
        <div className="dc-form-field">
          <label>{t('voucher_date')}</label>
          <FormattedDateInput value={docDate} onChange={setDocDate} required />
        </div>
      </div>

      <div className="dc-form-row dc-cash-shekel-row">
        <div className="dc-form-field" style={{ flex: 1 }}>
          <label>{t('voucher_cash_amount')}</label>
          <div className="dc-input-with-tag">
            <input
              type="number" min="0" step="0.01"
              value={shekelAmount} onChange={(e) => setShekelAmount(e.target.value)}
              placeholder={t('voucher_cash_amount_optional')}
            />
            <span className="dc-input-tag">
              {baseCashBox?.name || t('voucher_shekel_cash_box')}
            </span>
          </div>
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
                <input
                  type="number" min="0" step="0.01" placeholder={t('amount')}
                  value={p.amount} onChange={(e) => updateForeignRow(i, { amount: e.target.value })}
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
              />
              <button type="button" onClick={() => removeCheckRow(i)}>×</button>
            </div>
          ))}
          <button type="button" onClick={addCheckRow}>{t('check_add')}</button>
          <div>{t('checks_total')}: {checksTotal.toFixed(2)}</div>
        </div>
      )}

      {(shekelCashNum > 0 || foreignTotal > 0 || checksTotal > 0) && (
        <div className="font-bold dc-muted text-sm">
          {t('voucher_document_total')}: {t('voucher_mixed_total_hint')}
        </div>
      )}

      <input
        type="text" placeholder={t('voucher_memo')}
        value={memo} onChange={(e) => setMemo(e.target.value)}
      />

      {waEnabled && !waAutoPayment && (
        <label className="dc-check-row">
          <input
            type="checkbox"
            checked={sendWaConfirm}
            onChange={(e) => setSendWaConfirm(e.target.checked)}
          />
          {t('wa_receipt_confirm')}
        </label>
      )}
      {waEnabled && waAutoPayment && (
        <p className="dc-muted text-sm">{t('wa_receipt_auto_note')}</p>
      )}

      {error && <div className="dc-error">{error}</div>}

      <button type="submit" className="dc-success" disabled={submitting}>
        {submitting ? t('saving_voucher') : t('save_voucher')}
      </button>
    </form>
  );
}
