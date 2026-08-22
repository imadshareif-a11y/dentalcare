import { useSettings } from '../context/SettingsContext';
import { applyNumberDigits, toWesternDigits, resolveCurrencySymbol } from '../utils/format';

/**
 * حقل رقم يحترم ترميز الأرقام في العيادة، ويُظهر رمز العملة بجانب المبالغ.
 * التخزين دائماً بأرقام غربية.
 */
export default function ClinicNumberInput({
  value,
  onChange,
  className = '',
  showCurrency = false,
  currencySymbol: currencySymbolProp,
  extraTag = null,
  allowNegative = false,
  ...rest
}) {
  const { settings } = useSettings();
  const mode = settings?.numberDigits || 'western';
  const symbol = showCurrency
    ? (currencySymbolProp || resolveCurrencySymbol(settings))
    : (currencySymbolProp || null);
  const display = value === '' || value == null
    ? ''
    : applyNumberDigits(value, settings);

  const input = (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      lang={mode === 'western' ? 'en' : 'ar'}
      className={`dc-num ${className}`.trim()}
      value={display}
      onChange={(e) => {
        let western = toWesternDigits(e.target.value);
        western = allowNegative
          ? western.replace(/[^\d.-]/g, '')
          : western.replace(/[^\d.]/g, '');
        onChange?.(western);
      }}
    />
  );

  if (!symbol && !extraTag) return input;

  return (
    <div className="dc-input-with-tag dc-money-input">
      {input}
      {symbol ? (
        <span className="dc-input-tag dc-currency-tag" aria-hidden="true">{symbol}</span>
      ) : null}
      {extraTag ? (
        <span className="dc-input-tag">{extraTag}</span>
      ) : null}
    </div>
  );
}
