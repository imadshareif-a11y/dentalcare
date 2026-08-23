import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { localizedEditValue, localizedPayload } from '../lib/localizedName';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';

const CHART_NAME_KEYS = {
  ar: ['account_name_ar', 'account_name', 'name'],
  en: ['account_name_en', 'name_en'],
  he: ['account_name_he', 'name_he'],
};

const EMPTY = {
  name: '',
  accountCode: '',
  accountType: 'ASSET',
  parentId: null,
  isGroup: false,
  isActive: true,
  currencyId: '',
};

const TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

export default function ChartAccountForm({
  record,
  parentHint,
  defaultType,
  onSaved,
  onCancel,
}) {
  const { t, i18n } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        name: localizedEditValue(record, i18n.language, CHART_NAME_KEYS),
        accountCode: record.account_code || '',
        accountType: record.account_type || 'ASSET',
        parentId: record.parent_id || null,
        isGroup: Boolean(record.is_group),
        isActive: record.is_active !== false,
        currencyId: record.currency_id || baseCurrency?.id || '',
      });
    } else {
      setForm({
        ...EMPTY,
        accountType: parentHint?.account_type || defaultType || 'ASSET',
        parentId: parentHint?.id || null,
        isGroup: false,
        currencyId: baseCurrency?.id || '',
      });
    }
    setError(null);
  }, [record, parentHint, defaultType, i18n.language, baseCurrency?.id]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t('chart_name_required'));
      return;
    }
    if (!form.accountCode.trim()) {
      setError(t('chart_code_required'));
      return;
    }

    setSubmitting(true);
    try {
      const namePayload = localizedPayload(form.name, i18n.language);
      if (isEdit) {
        await api.patch(`/chart-tree/${record.id}`, {
          ...namePayload,
          accountCode: form.accountCode.trim(),
          isGroup: form.isGroup,
          isActive: form.isActive,
          parentId: form.parentId,
          accountType: form.parentId ? undefined : form.accountType,
          currencyId: form.currencyId || null,
        });
      } else {
        await api.post('/chart-tree', {
          ...namePayload,
          accountCode: form.accountCode.trim(),
          accountType: form.accountType,
          parentId: form.parentId,
          isGroup: form.isGroup,
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

  const lockedType = Boolean(form.parentId || parentHint?.id);
  const currencyLocked = isEdit && Boolean(record?.is_linked);

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {parentHint && !isEdit && (
        <p className="dc-muted text-sm">
          {t('chart_under')}: <strong>{parentHint.account_code} — {parentHint.account_name_ar || parentHint.account_name}</strong>
        </p>
      )}

      <div className="dc-form-row">
        <div className="dc-form-field">
          <label>{t('chart_code')}</label>
          <input
            type="text"
            value={form.accountCode}
            onChange={(e) => setField('accountCode', e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        {!lockedType && (
          <div className="dc-form-field">
            <label>{t('chart_type')}</label>
            <select
              value={form.accountType}
              onChange={(e) => setField('accountType', e.target.value)}
              disabled={isEdit && Boolean(record?.parent_id)}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>{t(`chart_type_${type.toLowerCase()}`)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="dc-muted text-sm">{t('chart_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
      </div>
      <p className="dc-muted text-sm">{t('localized_name_hint')}</p>

      <CurrencySelect
        label={t('account_currency')}
        value={form.currencyId}
        onChange={(id) => setField('currencyId', id)}
        currencies={currencies}
        disabled={currencyLocked}
      />
      {!currencyLocked && (
        <p className="dc-muted text-sm">{t('account_currency_default_hint')}</p>
      )}

      <label className="dc-check-row">
        <input
          type="checkbox"
          checked={form.isGroup}
          onChange={(e) => setField('isGroup', e.target.checked)}
        />
        {t('chart_is_group')}
      </label>

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

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting}>
          {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('chart_add'))}
        </button>
        {onCancel && (
          <button type="button" className="dc-ghost" onClick={onCancel}>{t('btn_cancel')}</button>
        )}
      </div>
    </form>
  );
}
