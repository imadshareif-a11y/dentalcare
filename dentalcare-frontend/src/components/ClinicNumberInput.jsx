import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';
import { applyNumberDigits, toWesternDigits, resolveCurrencySymbol } from '../utils/format';
import CalculatorModal from './CalculatorModal';

/**
 * حقل رقم يحترم ترميز الأرقام في العيادة، ويُظهر رمز العملة بجانب المبالغ.
 * F4 يفتح آلة حاسبة لإرجاع النتيجة إلى الحقل.
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
  enableCalculator = true,
  onKeyDown: onKeyDownProp,
  title: titleProp,
  ...rest
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const inputRef = useRef(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const mode = settings?.numberDigits || 'western';
  const symbol = showCurrency
    ? (currencySymbolProp || resolveCurrencySymbol(settings))
    : (currencySymbolProp || null);
  const display = value === '' || value == null
    ? ''
    : applyNumberDigits(value, settings);

  useEffect(() => {
    if (!enableCalculator) return undefined;

    function onF4(e) {
      if (e.key !== 'F4') return;
      if (document.activeElement !== inputRef.current) return;
      e.preventDefault();
      setCalcOpen(true);
    }

    window.addEventListener('keydown', onF4);
    return () => window.removeEventListener('keydown', onF4);
  }, [enableCalculator]);

  function handleKeyDown(e) {
    onKeyDownProp?.(e);
  }

  function applyCalculator(result) {
    onChange?.(result);
    setCalcOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  const input = (
    <>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        lang={mode === 'western' ? 'en' : 'ar'}
        className={`dc-num${enableCalculator ? ' dc-num-calc' : ''} ${className}`.trim()}
        value={display}
        title={titleProp ?? (enableCalculator ? t('calc_f4_hint') : undefined)}
        onChange={(e) => {
          let western = toWesternDigits(e.target.value);
          western = allowNegative
            ? western.replace(/[^\d.-]/g, '')
            : western.replace(/[^\d.]/g, '');
          onChange?.(western);
        }}
        onKeyDown={handleKeyDown}
      />
      {enableCalculator && (
        <CalculatorModal
          open={calcOpen}
          initialValue={value ?? ''}
          allowNegative={allowNegative}
          onApply={applyCalculator}
          onClose={() => setCalcOpen(false)}
        />
      )}
    </>
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
