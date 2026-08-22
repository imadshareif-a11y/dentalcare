import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

import { localizedEditValue, localizedPayload } from '../lib/localizedName';

const EMPTY_BANK = { bankNumber: '', name: '', isActive: true };

export function BankCatalogForm({ record, onSaved }) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY_BANK);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        bankNumber: record.bank_number || '',
        name: localizedEditValue(record, i18n.language),
        isActive: record.is_active !== false,
      });
    } else {
      setForm(EMPTY_BANK);
    }
    setError(null);
  }, [record, i18n.language]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.bankNumber.trim() || !form.name.trim()) {
      setError(t('bank_required_fields'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        bankNumber: form.bankNumber.trim(),
        ...localizedPayload(form.name, i18n.language),
        isActive: form.isActive,
      };
      if (isEdit) await api.patch(`/banks/${record.id}`, payload);
      else await api.post('/banks', payload);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('bank_number')}</label>
          <input
            type="text"
            value={form.bankNumber}
            onChange={(e) => setField('bankNumber', e.target.value)}
            required
          />
        </div>
        <div className="dc-form-field">
          <label>{t('bank_name')}</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </div>
      </div>
      <p className="dc-muted text-sm">{t('localized_name_hint')}</p>
      {isEdit && (
        <label className="dc-check-row">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          {t('cash_box_is_active')}
        </label>
      )}
      {error && <div className="dc-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('bank_add'))}
      </button>
    </form>
  );
}

const EMPTY_ACCOUNT = {
  accountKind: 'CURRENT',
  bankId: '',
  currencyId: '',
  name: '',
  accountNumber: '',
  isActive: true,
};

export function BankAccountForm({
  record,
  banks,
  currencies,
  defaultKind = 'CURRENT',
  onSaved,
}) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        accountKind: record.account_kind || 'CURRENT',
        bankId: record.bank_id || '',
        currencyId: record.currency_id || '',
        name: localizedEditValue(record, i18n.language),
        accountNumber: record.account_number || '',
        isActive: record.is_active !== false,
      });
    } else {
      setForm({ ...EMPTY_ACCOUNT, accountKind: defaultKind });
    }
    setError(null);
  }, [record, defaultKind, i18n.language]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t('bank_account_name_required'));
      return;
    }
    setSubmitting(true);
    try {
      const namePayload = localizedPayload(form.name, i18n.language);
      if (isEdit) {
        await api.patch(`/bank-accounts/${record.id}`, {
          ...namePayload,
          accountNumber: form.accountNumber.trim() || null,
          bankId: form.bankId || null,
          currencyId: form.currencyId || null,
          isActive: form.isActive,
        });
      } else {
        await api.post('/bank-accounts', {
          accountKind: form.accountKind,
          ...namePayload,
          accountNumber: form.accountNumber.trim() || null,
          bankId: form.bankId || null,
          currencyId: form.currencyId || null,
        });
      }
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!isEdit && (
        <div>
          <label className="dc-muted text-sm">{t('bank_account_kind')}</label>
          <select
            value={form.accountKind}
            onChange={(e) => setField('accountKind', e.target.value)}
            required
          >
            <option value="CURRENT">{t('bank_account_kind_current')}</option>
            <option value="COLLECTION">{t('bank_account_kind_collection')}</option>
            <option value="PAYMENT">{t('bank_account_kind_payment')}</option>
            <option value="SAVINGS">{t('bank_account_kind_savings')}</option>
          </select>
        </div>
      )}

      <div>
        <label className="dc-muted text-sm">{t('bank_account_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
      </div>

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('bank_linked')}</label>
          <select value={form.bankId} onChange={(e) => setField('bankId', e.target.value)}>
            <option value="">{t('bank_choose_optional')}</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>{b.bank_number} — {b.name}</option>
            ))}
          </select>
        </div>
        <div className="dc-form-field">
          <label>{t('bank_account_number')}</label>
          <input
            type="text"
            value={form.accountNumber}
            onChange={(e) => setField('accountNumber', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="dc-muted text-sm">{t('doc_currency')}</label>
        <select value={form.currencyId} onChange={(e) => setField('currencyId', e.target.value)}>
          <option value="">{t('doc_currency_choose')}</option>
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.symbol}</option>
          ))}
        </select>
      </div>
      <p className="dc-muted text-sm">{t('localized_name_hint')}</p>

      {isEdit && (
        <label className="dc-check-row">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setField('isActive', e.target.checked)}
          />
          {t('cash_box_is_active')}
        </label>
      )}

      {error && <div className="dc-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('bank_account_add'))}
      </button>
    </form>
  );
}

const EMPTY_CHECKBOOK = { serialFrom: '', serialTo: '', nextSerial: '' };

export function CheckbookIssueForm({ account, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_CHECKBOOK);
  const [existing, setExisting] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(EMPTY_CHECKBOOK);
    setError(null);
    if (!account?.id) {
      setExisting([]);
      setLoadingBooks(false);
      return;
    }
    setLoadingBooks(true);
    api.get(`/bank-accounts/${account.id}/checkbooks`)
      .then((rows) => setExisting(Array.isArray(rows) ? rows : []))
      .catch(() => setExisting([]))
      .finally(() => setLoadingBooks(false));
  }, [account]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.serialFrom.trim() || !form.serialTo.trim()) {
      setError(t('checkbook_serial_required'));
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/bank-accounts/${account.id}/checkbooks`, {
        serialFrom: form.serialFrom.trim(),
        serialTo: form.serialTo.trim(),
        nextSerial: form.nextSerial.trim() || form.serialFrom.trim(),
      });
      onSaved?.();
    } catch (err) {
      const msg = err instanceof ApiError
        ? (err.body?.error || err.message)
        : (err?.message || t('error_network'));
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="dc-muted text-sm">
        <strong>{account?.name}</strong>
        {account?.bank_number ? ` — ${account.bank_number}` : ''}
        {account?.account_number ? ` (${account.account_number})` : ''}
      </div>
      <p className="dc-muted text-sm">{t('checkbook_issue_hint')}</p>

      {loadingBooks && <div>{t('ledger_loading')}</div>}
      {!loadingBooks && existing.length > 0 && (
        <div className="space-y-1">
          <h5>{t('checkbook_existing_title')}</h5>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>{t('checkbook_serial_from')}</th>
                <th>{t('checkbook_serial_to')}</th>
                <th>{t('checkbook_next_serial')}</th>
                <th>{t('checkbook_remaining')}</th>
                <th>{t('currency_status')}</th>
              </tr>
            </thead>
            <tbody>
              {existing.map((book) => (
                <tr key={book.id}>
                  <td>{book.serial_from}</td>
                  <td>{book.serial_to}</td>
                  <td>{book.next_serial}</td>
                  <td>{book.remaining ?? '—'}</td>
                  <td>
                    {book.is_active
                      ? <span className="dc-badge dc-badge-emerald">{t('currency_active')}</span>
                      : <span className="dc-badge dc-badge-amber">{t('checkbook_exhausted')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="dc-form-row">
          <div className="dc-form-field">
            <label>{t('checkbook_serial_from')}</label>
            <input
              type="text"
              value={form.serialFrom}
              onChange={(e) => setField('serialFrom', e.target.value)}
              required
            />
          </div>
          <div className="dc-form-field">
            <label>{t('checkbook_serial_to')}</label>
            <input
              type="text"
              value={form.serialTo}
              onChange={(e) => setField('serialTo', e.target.value)}
              required
            />
          </div>
        </div>
        <div>
          <label className="dc-muted text-sm">{t('checkbook_next_serial_optional')}</label>
          <input
            type="text"
            value={form.nextSerial}
            onChange={(e) => setField('nextSerial', e.target.value)}
            placeholder={form.serialFrom || t('checkbook_serial_from')}
          />
        </div>
        {error && <div className="dc-error">{error}</div>}
        <button type="submit" disabled={submitting}>
          {submitting ? t('party_saving') : t('checkbook_issue_submit')}
        </button>
      </form>
    </div>
  );
}
