import { useTranslation } from 'react-i18next';

export default function CurrencySelect({
  value,
  onChange,
  currencies = [],
  required = true,
  label,
  disabled = false,
}) {
  const { t } = useTranslation();
  return (
    <div className="dc-form-field">
      <label>{label || t('doc_currency')}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        required={required}
        disabled={disabled || currencies.length === 0}
      >
        <option value="">{t('doc_currency_choose')}</option>
        {currencies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.symbol}{c.is_base ? ` (${t('currency_base_badge')})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
