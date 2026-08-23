import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { localizedEditValue, localizedPayload } from '../lib/localizedName';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';

const EMPTY = {
  name: '',
  accountCode: '',
  isActive: true,
  currencyId: '',
};

const CHART_KEYS = {
  ar: ['account_name_ar', 'account_name', 'name'],
  en: ['account_name_en', 'name_en'],
  he: ['account_name_he', 'name_he'],
};

export default function AssetAccountForm({ record, onSaved }) {
  const { t, i18n } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setForm({
        name: localizedEditValue(record, i18n.language, CHART_KEYS),
        accountCode: record.account_code || '',
        isActive: record.is_active !== false,
      });
    } else {
      setForm({ ...EMPTY, currencyId: baseCurrency?.id || '' });
    }
    setError(null);
  }, [record, i18n.language, baseCurrency?.id]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t('asset_account_name_required'));
      return;
    }
    setSubmitting(true);
    try {
      const namePayload = localizedPayload(form.name, i18n.language);
      if (isEdit) {
        await api.patch(`/asset-accounts/${record.id}`, {
          ...namePayload,
          isActive: form.isActive,
        });
      } else {
        await api.post('/asset-accounts', {
          ...namePayload,
          accountCode: form.accountCode.trim() || null,
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
          <label className="dc-muted text-sm">{t('asset_account_code')}</label>
          <input
            type="text"
            value={form.accountCode}
            onChange={(e) => setField('accountCode', e.target.value.replace(/\D/g, ''))}
            placeholder={t('asset_account_code_auto')}
          />
        </div>
      )}

      {isEdit && (
        <p className="dc-muted text-sm">{t('asset_account_code')}: {record.account_code}</p>
      )}

      <div>
        <label className="dc-muted text-sm">{t('asset_account_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
      </div>
      <p className="dc-muted text-sm">{t('localized_name_hint')}</p>

      {!isEdit && (
        <>
          <CurrencySelect
            label={t('account_currency')}
            value={form.currencyId}
            onChange={(id) => setField('currencyId', id)}
            currencies={currencies}
          />
          <p className="dc-muted text-sm">{t('account_currency_default_hint')}</p>
        </>
      )}

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
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('asset_account_add'))}
      </button>
    </form>
  );
}
