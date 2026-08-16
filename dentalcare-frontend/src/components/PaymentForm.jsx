// components/PaymentForm.jsx
// -----------------------------------------------------------
// ثلاث طرق دفع:
// 1) 'normal' — صندوق/بنك مباشر → POST /payments
// 2) 'newCheck' — إصدار شيك أو أكثر (كل شيك قيد مستقل) → POST /payments
// 3) 'existingCheck' — تظهير شيك أو أكثر من الحافظة لنفس المستفيد
//    → استدعاء POST /checks/:id/endorse لكل شيك مختار على حدة
//    (الـ endpoint نفسه محمي أصلًا: ما بيقبل شيك انترحّل قبل،
//    فحتى لو تكرر النداء، ما في خطر ازدواج)
// -----------------------------------------------------------

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, newIdempotencyKey } from '../api/client';
import CheckFields from './CheckFields';

export default function PaymentForm({ accounts, onPosted }) {
  const { t } = useTranslation();
  const cashAccounts = accounts.filter((a) => ['ASSET', 'LIABILITY'].includes(a.account_type));
  const payeeAccounts = accounts.filter((a) => ['RECEIVABLE', 'EXPENSE'].includes(a.account_type));

  const [method, setMethod] = useState('normal'); // normal | newCheck | existingCheck
  const [payeeAccountId, setPayeeAccountId] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [checkList, setCheckList] = useState([]); // [{..., idempotencyKey}] لطريقة newCheck
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  const checksTotal = checkList.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  function addCheckRow() {
    setCheckList((prev) => [...prev, { idempotencyKey: newIdempotencyKey() }]);
  }
  function updateCheckRow(index, updated) {
    setCheckList((prev) => prev.map((c, i) => (i === index ? { ...updated, idempotencyKey: c.idempotencyKey } : c)));
  }
  function removeCheckRow(index) {
    setCheckList((prev) => prev.filter((_, i) => i !== index));
  }

  // --- طريقة "شيك موجود بالحافظة" (تظهير) ---
  const [pendingChecks, setPendingChecks] = useState([]);
  const [selectedCheckIds, setSelectedCheckIds] = useState(new Set());
  const [loadingChecks, setLoadingChecks] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');

  useEffect(() => {
    if (method !== 'existingCheck') return;
    setLoadingChecks(true);
    api.get('/checks', { status: 'PENDING' })
      .then((data) => setPendingChecks(data.filter((c) => c.check_type === 'RECEIVED')))
      .catch(() => setPendingChecks([]))
      .finally(() => setLoadingChecks(false));
  }, [method]);

  useEffect(() => {
    if (method === 'newCheck' && checkList.length === 0) addCheckRow();
    if (method !== 'newCheck') setCheckList([]);
    if (method !== 'existingCheck') {
      setSelectedCheckIds(new Set());
      setSearchText('');
      setDueFrom('');
      setDueTo('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

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

  function toggleCheckSelection(id) {
    setSelectedCheckIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function resetForm() {
    setPayeeAccountId('');
    setCashAccountId('');
    setAmount('');
    setMemo('');
    setCheckList([]);
    setSelectedCheckIds(new Set());
    setMethod('normal');
    setIdempotencyKey(newIdempotencyKey());
  }

  async function handleSubmitExistingCheck(e) {
    e.preventDefault();
    setError(null);

    if (!payeeAccountId || selectedCheckIds.size === 0) {
      setError(t('accounts_required'));
      return;
    }

    setSubmitting(true);
    const results = [];
    const failures = [];
    // كل شيك عملية endorse مستقلة — لو واحد فشل، الباقي يلي
    // نجحوا فعليًا انترحّلوا ولازم المستخدم يعرف هيك بالضبط
    for (const checkId of selectedCheckIds) {
      try {
        const result = await api.post(`/checks/${checkId}/endorse`, { payeeAccountId });
        results.push(result);
      } catch (err) {
        failures.push(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      }
    }
    setSubmitting(false);

    if (failures.length > 0) {
      setError(`${failures.length}/${selectedCheckIds.size}: ${failures[0]}`);
      // نحدّث القائمة عشان تعكس الشيكات يلي فعليًا انترحّلت
      const data = await api.get('/checks', { status: 'PENDING' }).catch(() => []);
      setPendingChecks(data.filter((c) => c.check_type === 'RECEIVED'));
      setSelectedCheckIds(new Set());
      return;
    }

    resetForm();
    onPosted?.({ success: true, count: results.length });
  }

  async function handleSubmitNormalOrNewCheck(e) {
    e.preventDefault();
    setError(null);

    if (!payeeAccountId || !cashAccountId) {
      setError(t('accounts_required'));
      return;
    }
    if (payeeAccountId === cashAccountId) {
      setError(t('accounts_required'));
      return;
    }

    if (method === 'newCheck') {
      if (checkList.length === 0) {
        setError(t('accounts_required'));
        return;
      }
      for (const c of checkList) {
        if (!c.checkNumber || !c.bankName || !c.dueDate || !Number(c.amount) || Number(c.amount) <= 0) {
          setError(t('amount_required'));
          return;
        }
      }
    } else {
      const numericAmount = Number(amount);
      if (!numericAmount || numericAmount <= 0) {
        setError(t('amount_required'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await api.post('/payments', {
        payeeAccountId,
        cashAccountId,
        amount: method === 'newCheck' ? undefined : Number(amount),
        memo,
        idempotencyKey,
        checks: method === 'newCheck' ? checkList : undefined,
      });
      resetForm();
      onPosted?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const handleSubmit = method === 'existingCheck' ? handleSubmitExistingCheck : handleSubmitNormalOrNewCheck;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('payment_title')}</h3>

      <div>
        <label>{t('payment_method')}</label>
        <select value={method} onChange={(e) => { setMethod(e.target.value); setError(null); }}>
          <option value="normal">{t('payment_method_normal')}</option>
          <option value="newCheck">{t('payment_method_new_check')}</option>
          <option value="existingCheck">{t('payment_method_existing_check')}</option>
        </select>
      </div>

      <div>
        <label>{t('payment_payee_account')}</label>
        <select value={payeeAccountId} onChange={(e) => setPayeeAccountId(e.target.value)} required>
          <option value="">{t('voucher_choose_account')}</option>
          {payeeAccounts.map((a) => (
            <option key={a.id} value={a.id}>{a.account_name}</option>
          ))}
        </select>
      </div>

      {method === 'existingCheck' ? (
        <div className="space-y-2">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <input
              type="text" placeholder={t('check_search_placeholder')}
              value={searchText} onChange={(e) => setSearchText(e.target.value)}
            />
            <label>
              {t('check_filter_due_from')}
              <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
            </label>
            <label>
              {t('check_filter_due_to')}
              <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
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
                  <th></th>
                  <th>{t('check_col_number')}</th>
                  <th>{t('check_col_bank')}</th>
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
                    <td>{c.due_date}</td>
                    <td>{Number(c.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {selectedCheckIds.size > 0 && (
            <div>{t('check_selected_count', { count: selectedCheckIds.size, total: selectedTotal.toFixed(2) })}</div>
          )}
        </div>
      ) : (
        <>
          <div>
            <label>{t('payment_cash_account')}</label>
            <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)} required>
              <option value="">{t('voucher_choose_account')}</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.account_name}</option>
              ))}
            </select>
          </div>

          {method !== 'newCheck' && (
            <div>
              <label>{t('amount')}</label>
              <input
                type="number" min="0" step="0.01"
                value={amount} onChange={(e) => setAmount(e.target.value)} required
              />
            </div>
          )}

          {method === 'newCheck' && (
            <div className="space-y-2">
              {checkList.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                  <CheckFields check={c} onChange={(updated) => updateCheckRow(i, updated)} showAmount />
                  <button type="button" onClick={() => removeCheckRow(i)}>×</button>
                </div>
              ))}
              <button type="button" onClick={addCheckRow}>{t('check_add')}</button>
              <div>{t('checks_total')}: {checksTotal.toFixed(2)}</div>
            </div>
          )}

          <input
            type="text" placeholder={t('voucher_memo')}
            value={memo} onChange={(e) => setMemo(e.target.value)}
          />
        </>
      )}

      {error && <div style={{ color: 'crimson', fontWeight: 'bold' }}>{error}</div>}

      <button type="submit" disabled={submitting}>
        {submitting
          ? t('saving_voucher')
          : method === 'existingCheck' ? t('check_endorse_multiple') : t('save_voucher')}
      </button>
    </form>
  );
}
