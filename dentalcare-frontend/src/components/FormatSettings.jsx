import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import {
  applyNumberDigits,
  formatDate,
  formatMoney,
  formatTime,
  resolveCurrencySymbol,
} from '../utils/format';

const THOUSANDS_PRESETS = [
  { id: 'comma', value: ',', label: ',' },
  { id: 'dot', value: '.', label: '.' },
  { id: 'space', value: ' ', label: '␣' },
  { id: 'none', value: '', label: '—' },
];

const DECIMAL_PRESETS = [
  { id: 'dot', value: '.' },
  { id: 'comma', value: ',' },
];

const DIGIT_MODES = [
  { id: 'western', icon: 'fa-solid fa-hashtag', sample: '1,234.56' },
  { id: 'eastern', icon: 'fa-solid fa-language', sample: '١٬٢٣٤٫٥٦' },
];

const TIME_MODES = [
  { id: '12h', labelKey: 'settings_time_format_12h' },
  { id: '24h', labelKey: 'settings_time_format_24h' },
];

const DECIMAL_PLACES = [0, 1, 2, 3, 4];

export default function FormatSettings({
  formatForm,
  setFormatForm,
  dateFormats = [],
  currencies = [],
  onSave,
  saving = false,
  locale = 'ar',
}) {
  const { t } = useTranslation();
  const [expenseAccounts, setExpenseAccounts] = useState([]);

  useEffect(() => {
    api.get('/accounts')
      .then((rows) => setExpenseAccounts((rows || []).filter((a) => a.account_type === 'EXPENSE')))
      .catch(() => setExpenseAccounts([]));
  }, []);

  const previewSettings = useMemo(() => {
    const currency = currencies.find((c) => String(c.id) === String(formatForm.baseCurrencyId));
    return {
      ...formatForm,
      currencySymbol: currency?.symbol || resolveCurrencySymbol(formatForm),
      baseCurrencyCode: currency?.code || formatForm.baseCurrencyCode || 'ILS',
    };
  }, [formatForm, currencies]);

  const previews = useMemo(() => {
    const sampleDate = '2026-08-23';
    const sampleTime = '14:30';
    const sampleAmount = 1234567.89;
    const sampleInt = 12345;
    return {
      date: formatDate(sampleDate, previewSettings),
      time: formatTime(sampleTime, previewSettings, locale),
      money: formatMoney(sampleAmount, previewSettings),
      digits: applyNumberDigits(String(sampleInt), previewSettings),
    };
  }, [previewSettings, locale]);

  const sepConflict = formatForm.thousandsSeparator
    && formatForm.decimalSeparator
    && formatForm.thousandsSeparator === formatForm.decimalSeparator;

  function patch(fields) {
    setFormatForm((prev) => ({ ...prev, ...fields }));
  }

  return (
    <section className="dc-settings-panel dc-format-panel">
      <div className="dc-format-intro">
        <h4>{t('settings_format_title')}</h4>
        <p className="dc-muted text-sm">{t('settings_format_hint')}</p>
      </div>

      <div className="dc-format-live-preview" aria-live="polite">
        <div className="dc-format-live-head">
          <i className="fa-solid fa-eye" aria-hidden />
          <strong>{t('settings_format_preview_title')}</strong>
        </div>
        <div className="dc-format-live-grid">
          <div className="dc-format-live-item">
            <span className="dc-format-live-label">{t('settings_format_preview_date')}</span>
            <output className="dc-format-live-value">{previews.date}</output>
          </div>
          <div className="dc-format-live-item">
            <span className="dc-format-live-label">{t('settings_format_preview_time')}</span>
            <output className="dc-format-live-value">{previews.time}</output>
          </div>
          <div className="dc-format-live-item is-wide">
            <span className="dc-format-live-label">{t('settings_format_preview_money')}</span>
            <output className="dc-format-live-value is-money">{previews.money}</output>
          </div>
          <div className="dc-format-live-item">
            <span className="dc-format-live-label">{t('settings_format_preview_digits')}</span>
            <output className="dc-format-live-value">{previews.digits}</output>
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave?.(e);
        }}
        className="dc-format-form"
      >
        <div className="dc-format-grid">
          <article className="dc-format-card">
            <header className="dc-format-card-head">
              <span className="dc-format-card-icon tone-violet"><i className="fa-solid fa-hashtag" /></span>
              <div>
                <h5>{t('settings_format_section_digits')}</h5>
                <p className="dc-muted text-sm">{t('settings_number_digits_hint')}</p>
              </div>
            </header>
            <div className="dc-format-choice-row" role="group" aria-label={t('settings_number_digits')}>
              {DIGIT_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`dc-format-choice${(formatForm.numberDigits || 'western') === mode.id ? ' is-active' : ''}`}
                  onClick={() => patch({ numberDigits: mode.id })}
                >
                  <i className={mode.icon} aria-hidden />
                  <span>{t(mode.id === 'western' ? 'settings_number_digits_western' : 'settings_number_digits_eastern')}</span>
                  <span className="dc-format-choice-sample">{mode.sample}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="dc-format-card">
            <header className="dc-format-card-head">
              <span className="dc-format-card-icon tone-sky"><i className="fa-regular fa-calendar" /></span>
              <div>
                <h5>{t('settings_format_section_datetime')}</h5>
                <p className="dc-muted text-sm">{t('settings_time_format_hint')}</p>
              </div>
            </header>
            <div className="dc-format-field-block">
              <span className="dc-format-field-label">{t('settings_date_format')}</span>
              <div className="dc-format-chip-row">
                {dateFormats.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className={`dc-format-chip${formatForm.dateFormat === fmt ? ' is-active' : ''}`}
                    onClick={() => patch({ dateFormat: fmt })}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <div className="dc-format-field-block">
              <span className="dc-format-field-label">{t('settings_time_format')}</span>
              <div className="dc-format-seg" role="group">
                {TIME_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`dc-format-seg-btn${(formatForm.timeFormat || '12h') === mode.id ? ' is-active' : ''}`}
                    onClick={() => patch({ timeFormat: mode.id })}
                  >
                    {t(mode.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <article className="dc-format-card">
            <header className="dc-format-card-head">
              <span className="dc-format-card-icon tone-emerald"><i className="fa-solid fa-coins" /></span>
              <div>
                <h5>{t('settings_format_section_money')}</h5>
                <p className="dc-muted text-sm">{t('settings_format_money_hint')}</p>
              </div>
            </header>
            <div className="dc-format-field-block">
              <span className="dc-format-field-label">{t('settings_decimals')}</span>
              <div className="dc-format-seg">
                {DECIMAL_PLACES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`dc-format-seg-btn${Number(formatForm.decimalPlaces) === n ? ' is-active' : ''}`}
                    onClick={() => patch({ decimalPlaces: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="dc-format-field-block">
              <span className="dc-format-field-label">{t('settings_thousands')}</span>
              <div className="dc-format-seg">
                {THOUSANDS_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`dc-format-seg-btn is-mono${formatForm.thousandsSeparator === preset.value ? ' is-active' : ''}`}
                    onClick={() => patch({ thousandsSeparator: preset.value })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="dc-format-field-block">
              <span className="dc-format-field-label">{t('settings_decimal_sep')}</span>
              <div className="dc-format-seg">
                {DECIMAL_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`dc-format-seg-btn is-mono${formatForm.decimalSeparator === preset.value ? ' is-active' : ''}`}
                    onClick={() => patch({ decimalSeparator: preset.value })}
                  >
                    {preset.value}
                  </button>
                ))}
              </div>
              {sepConflict && (
                <p className="dc-format-warn">{t('settings_format_sep_conflict')}</p>
              )}
            </div>
          </article>

          <article className="dc-format-card">
            <header className="dc-format-card-head">
              <span className="dc-format-card-icon tone-amber"><i className="fa-solid fa-shekel-sign" /></span>
              <div>
                <h5>{t('settings_format_section_currency')}</h5>
                <p className="dc-muted text-sm">{t('settings_base_currency_hint')}</p>
              </div>
            </header>
            <label className="dc-format-currency-select">
              <span className="dc-sr-only">{t('settings_base_currency')}</span>
              <select
                value={formatForm.baseCurrencyId || ''}
                onChange={(e) => patch({ baseCurrencyId: e.target.value })}
                required
              >
                <option value="">{t('doc_currency_choose')}</option>
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.symbol} — {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            {formatForm.baseCurrencyId && (
              <div className="dc-format-currency-badge">
                {currencies.find((c) => String(c.id) === String(formatForm.baseCurrencyId))?.symbol || '—'}
              </div>
            )}
          </article>
        </div>

        <div className="dc-format-card">
          <div className="dc-format-card-head">
            <span className="dc-format-card-icon tone-amber">
              <i className="fa-solid fa-coins" />
            </span>
            <div>
              <h5>{t('settings_fx_account_title')}</h5>
              <p className="dc-muted text-sm">{t('settings_fx_account_hint')}</p>
            </div>
          </div>
          <label className="dc-field">
            <span>{t('settings_fx_account_label')}</span>
            <select
              value={formatForm.fxGainLossAccountId || ''}
              onChange={(e) => patch({ fxGainLossAccountId: e.target.value || null })}
            >
              <option value="">{t('settings_fx_account_default')}</option>
              {expenseAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} — {account.account_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="dc-format-form-footer">
          <button type="submit" className="dc-success" disabled={saving || sepConflict}>
            {saving ? t('ledger_loading') : t('settings_save_format')}
          </button>
        </div>
      </form>
    </section>
  );
}
