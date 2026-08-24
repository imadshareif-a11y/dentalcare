import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import CheckFields from './CheckFields';
import FormattedDateInput from './FormattedDateInput';
import PartyAccountSelect from './PartyAccountSelect';
import ClinicNumberInput from './ClinicNumberInput';
import DocPartyDateRow from './DocPartyDateRow';
import DocumentFormShell, { DocSection, DocToggle, DocTotalBar } from './DocumentFormShell';
import { useCurrencies } from '../hooks/useCurrencies';
import { useCashBoxes } from '../hooks/useCashBoxes';
import { useSettings } from '../context/SettingsContext';
import { useDocumentDraftBinding } from '../hooks/useDocumentDraftBinding';
import { foreignToBase, roundMoney } from '../lib/currencyMath';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyForeignPayment() {
  return { currencyId: '', cashAccountId: '', amount: '', key: newIdempotencyKey() };
}

export default function ReceiptForm({ accounts, onPosted, draft, registerDraftHandlers }) {
  const { t } = useTranslation();
  const { settings, money, currencySymbol } = useSettings();
  const { currencies, baseCurrency } = useCurrencies();
  const { cashBoxes, baseCashBox } = useCashBoxes();
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
  const foreignTotalBase = foreignPayments.reduce(
    (sum, p) => sum + foreignToBase(p.amount, p.currencyId, currencies),
    0
  );
  const checksTotalBase = checkList.reduce(
    (sum, c) => sum + foreignToBase(c.amount, c.currencyId, currencies),
    0
  );
  const documentTotal = roundMoney(shekelCashNum + foreignTotalBase + checksTotalBase);
  const showTotals = documentTotal > 0;

  const getPayload = useCallback(() => ({
    patientAccountId,
    docDate,
    shekelAmount,
    includeForeign,
    foreignPayments,
    memo,
    includeChecks,
    checkList: checkList.map(({ imageFront, imageBack, ...rest }) => rest),
    idempotencyKey,
    sendWaConfirm,
  }), [
    patientAccountId, docDate, shekelAmount, includeForeign, foreignPayments,
    memo, includeChecks, checkList, idempotencyKey, sendWaConfirm,
  ]);

  const applyPayload = useCallback((p) => {
    if (p.patientAccountId != null) setPatientAccountId(p.patientAccountId);
    if (p.docDate) setDocDate(p.docDate);
    if (p.shekelAmount != null) setShekelAmount(String(p.shekelAmount));
    if (typeof p.includeForeign === 'boolean') setIncludeForeign(p.includeForeign);
    if (Array.isArray(p.foreignPayments)) setForeignPayments(p.foreignPayments);
    if (p.memo != null) setMemo(p.memo);
    if (typeof p.includeChecks === 'boolean') setIncludeChecks(p.includeChecks);
    if (Array.isArray(p.checkList)) setCheckList(p.checkList);
    if (p.idempotencyKey) setIdempotencyKey(p.idempotencyKey);
    if (typeof p.sendWaConfirm === 'boolean') setSendWaConfirm(p.sendWaConfirm);
  }, []);

  const getSummary = useCallback(() => {
    const party = accounts.find((a) => a.id === patientAccountId);
    const name = party?.account_name || '';
    const amt = documentTotal > 0 ? money(documentTotal) : '';
    return [name, amt, memo].filter(Boolean).join(' — ').slice(0, 500);
  }, [accounts, patientAccountId, documentTotal, memo, money]);

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
            amount: documentTotal,
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

  const totalItems = [];
  if (shekelCashNum > 0) totalItems.push({ label: t('doc_total_cash'), value: money(shekelCashNum) });
  if (foreignTotalBase > 0) {
    totalItems.push({
      label: t('doc_total_foreign'),
      value: money(foreignTotalBase),
    });
  }
  if (checksTotalBase > 0) totalItems.push({ label: t('doc_total_checks'), value: money(checksTotalBase) });

  return (
    <DocumentFormShell
      variant="receipt"
      title={t('receipt_title')}
      subtitle={t('doc_receipt_subtitle')}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      totals={showTotals ? (
        <DocTotalBar
          items={totalItems}
          highlight={{ label: t('voucher_document_total'), value: money(documentTotal) }}
        />
      ) : null}
      footerExtra={(
        <>
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
        </>
      )}
    >
      <DocSection title={t('doc_section_party')}>
        <DocPartyDateRow
          accountId={patientAccountId}
          docDate={docDate}
          onDateChange={setDocDate}
        >
          <PartyAccountSelect
            accounts={accounts}
            value={patientAccountId}
            onChange={setPatientAccountId}
            label={t('party_account')}
            required
          />
        </DocPartyDateRow>
      </DocSection>

      <DocSection title={t('doc_section_amount')}>
        <div className="dc-doc-cash-hero dc-form-field dc-field-amount">
          <label>{t('doc_cash_primary')}</label>
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

        <div className="dc-doc-toggles">
          <DocToggle
            checked={includeForeign}
            onChange={toggleIncludeForeign}
            label={t('voucher_other_currencies')}
            icon="fa-solid fa-coins"
          />
          <DocToggle
            checked={includeChecks}
            onChange={toggleIncludeChecks}
            label={t('paid_by_check')}
            icon="fa-solid fa-money-check"
          />
        </div>

        {includeForeign && (
          <div className="dc-doc-panel">
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
                  <button type="button" className="dc-ghost-light" onClick={() => removeForeignRow(i)}>×</button>
                </div>
              );
            })}
            <button type="button" className="dc-ghost-light" onClick={addForeignRow}>
              <i className="fa-solid fa-plus" /> {t('voucher_add_foreign_payment')}
            </button>
          </div>
        )}

        {includeChecks && (
          <div className="dc-doc-panel">
            {checkList.map((c, i) => (
              <div key={c.idempotencyKey || i} className="dc-check-row-wrap">
                <CheckFields
                  check={c}
                  onChange={(updated) => updateCheckRow(i, updated)}
                  showAmount
                  currencies={currencies}
                />
                <button type="button" className="dc-ghost-light" onClick={() => removeCheckRow(i)}>×</button>
              </div>
            ))}
            <button type="button" className="dc-ghost-light" onClick={addCheckRow}>
              <i className="fa-solid fa-plus" /> {t('check_add')}
            </button>
          </div>
        )}
      </DocSection>

      <DocSection title={t('doc_section_details')}>
        <input
          type="text"
          placeholder={t('voucher_memo')}
          className="dc-field-memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </DocSection>
    </DocumentFormShell>
  );
}
