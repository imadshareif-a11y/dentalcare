import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { localizedEditValue, localizedPayload } from '../lib/localizedName';

const EMPTY = {
  boxKind: 'CASH',
  currencyId: '',
  name: '',
  isActive: true,
};

export default function CashBoxForm({ record, currencies, defaultKind = 'CASH', onSaved }) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        boxKind: record.box_kind || 'CASH',
        currencyId: record.currency_id || '',
        name: localizedEditValue(record, i18n.language),
        isActive: record.is_active !== false,
      });
    } else {
      setForm({ ...EMPTY, boxKind: defaultKind });
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
      setError(t('cash_box_name_required'));
      return;
    }
    if (!isEdit && (!form.currencyId || !form.boxKind)) {
      setError(t('cash_box_required_fields'));
      return;
    }

    setSubmitting(true);
    try {
      const namePayload = localizedPayload(form.name, i18n.language);
      if (isEdit) {
        await api.patch(`/cash-boxes/${record.id}`, {
          ...namePayload,
          isActive: form.isActive,
        });
      } else {
        await api.post('/cash-boxes', {
          boxKind: form.boxKind,
          currencyId: form.currencyId,
          ...namePayload,
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
        <>
          <div>
            <label className="dc-muted text-sm">{t('cash_box_kind')}</label>
            <select
              value={form.boxKind}
              onChange={(e) => setField('boxKind', e.target.value)}
              required
            >
              <option value="CASH">{t('cash_box_kind_cash')}</option>
              <option value="CHECKS_IN">{t('cash_box_kind_checks_in')}</option>
              <option value="CHECKS_OUT">{t('cash_box_kind_checks_out')}</option>
            </select>
          </div>
          <div>
            <label className="dc-muted text-sm">{t('doc_currency')}</label>
            <select
              value={form.currencyId}
              onChange={(e) => setField('currencyId', e.target.value)}
              required
            >
              <option value="">{t('doc_currency_choose')}</option>
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.symbol}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {isEdit && (
        <p className="dc-muted text-sm">
          {t(`cash_box_kind_${form.boxKind === 'CASH' ? 'cash' : form.boxKind === 'CHECKS_IN' ? 'checks_in' : 'checks_out'}`)}
          {' · '}
          {record.currency_code}
          {' · '}
          {record.account_code}
        </p>
      )}

      <div>
        <label className="dc-muted text-sm">{t('cash_box_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
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
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('cash_box_add'))}
      </button>
    </form>
  );
}
