import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

import { localizedEditValue, localizedPayload } from '../lib/localizedName';

const EMPTY = {
  code: '',
  name: '',
  symbol: '',
  decimalPlaces: '2',
  rateToBase: '',
  isBase: false,
  isActive: true,
};

export default function CurrencyForm({ record, baseCurrency, onSaved }) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(record?.id);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const baseCode = baseCurrency?.code || 'ILS';
  const baseSymbol = baseCurrency?.symbol || '₪';
  const editingIsCurrentBase = Boolean(record?.is_base);

  useEffect(() => {
    if (record) {
      setForm({
        code: record.code || '',
        name: localizedEditValue(record, i18n.language),
        symbol: record.symbol || '',
        decimalPlaces: String(record.decimal_places ?? 2),
        rateToBase: record.is_base ? '1' : String(record.rate_to_base ?? ''),
        isBase: Boolean(record.is_base),
        isActive: record.is_active !== false,
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [record, i18n.language]);

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'isBase' && value) next.rateToBase = '1';
      if (key === 'isBase' && !value && next.rateToBase === '1') next.rateToBase = '';
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.code.trim() || !form.name.trim() || !form.symbol.trim()) {
      setError(t('currency_required_fields'));
      return;
    }
    const rate = Number(form.rateToBase);
    if (!form.isBase && (!Number.isFinite(rate) || rate <= 0)) {
      setError(t('currency_rate_required'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        ...localizedPayload(form.name, i18n.language),
        symbol: form.symbol.trim(),
        decimalPlaces: Number(form.decimalPlaces),
        rateToBase: form.isBase ? 1 : rate,
        isBase: form.isBase,
        isActive: form.isActive,
      };
      if (isEdit) await api.patch(`/currencies/${record.id}`, payload);
      else await api.post('/currencies', payload);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const sampleRate = Number(form.rateToBase);
  const showSample = !form.isBase && Number.isFinite(sampleRate) && sampleRate > 0 && form.code;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="dc-form-row">
        <div className="dc-form-field">
          <label className="dc-muted text-sm">{t('currency_code')}</label>
          <input
            type="text"
            value={form.code}
            onChange={(e) => setField('code', e.target.value.toUpperCase())}
            maxLength={10}
            required
          />
        </div>
        <div className="dc-form-field">
          <label className="dc-muted text-sm">{t('currency_symbol')}</label>
          <input
            type="text"
            value={form.symbol}
            onChange={(e) => setField('symbol', e.target.value)}
            maxLength={16}
            required
          />
        </div>
      </div>

      <div className="dc-form-field">
        <label className="dc-muted text-sm">{t('currency_name')}</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          required
        />
      </div>
      <p className="dc-muted text-sm">{t('localized_name_hint')}</p>

      <div className="dc-form-field">
        <label className="dc-muted text-sm">{t('currency_decimal_places')}</label>
        <input
          type="number"
          min="0"
          max="6"
          step="1"
          value={form.decimalPlaces}
          onChange={(e) => setField('decimalPlaces', e.target.value)}
        />
      </div>

      <div>
        <label className="dc-muted text-sm">
          {t('currency_rate_vs_base', { code: baseCode, symbol: baseSymbol })}
        </label>
        <input
          type="number"
          min="0"
          step="any"
          value={form.rateToBase}
          onChange={(e) => setField('rateToBase', e.target.value)}
          disabled={form.isBase}
          required={!form.isBase}
          placeholder={form.isBase ? '1' : t('currency_rate_placeholder')}
        />
        <p className="dc-muted text-sm" style={{ marginTop: 4 }}>
          {form.isBase
            ? t('currency_rate_base_locked')
            : t('currency_rate_help', { code: baseCode })}
        </p>
        {showSample && (
          <p className="text-sm" style={{ marginTop: 2 }}>
            {t('currency_rate_example', {
              foreign: `1 ${form.code}`,
              base: `${sampleRate} ${baseCode}`,
            })}
          </p>
        )}
      </div>

      <label className="dc-check-row">
        <input
          type="checkbox"
          checked={form.isBase}
          onChange={(e) => setField('isBase', e.target.checked)}
          disabled={editingIsCurrentBase}
        />
        {t('currency_is_base')}
      </label>
      <label className="dc-check-row">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setField('isActive', e.target.checked)}
          disabled={form.isBase}
        />
        {t('currency_is_active')}
      </label>
      {error && <div className="dc-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('currency_add'))}
      </button>
    </form>
  );
}
