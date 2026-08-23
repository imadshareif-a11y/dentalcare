import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PartyModal from './PartyModal';
import { useSettings } from '../context/SettingsContext';
import { toWesternDigits } from '../utils/format';

const SAFE_EXPR = /^[\d+\-*/().%\s]*$/;

function evalExpression(raw) {
  const expr = toWesternDigits(String(raw || '')).trim();
  if (!expr || !SAFE_EXPR.test(expr)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expr})`)();
    if (!Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function formatResult(value, decimalPlaces) {
  if (!Number.isFinite(value)) return '';
  const factor = 10 ** decimalPlaces;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded);
}

const KEYPAD_ROWS = [
  [
    { key: 'C', labelKey: 'calc_clear' },
    { key: '⌫', icon: 'fa-solid fa-delete-left' },
    { key: '(' },
    { key: ')' },
  ],
  [{ key: '7' }, { key: '8' }, { key: '9' }, { key: '/', op: true }],
  [{ key: '4' }, { key: '5' }, { key: '6' }, { key: '*', op: true }],
  [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '-', op: true }],
  [{ key: '0', wide: true }, { key: '.' }, { key: '+', op: true }],
];

export default function CalculatorModal({
  open,
  initialValue = '',
  allowNegative = false,
  onApply,
  onClose,
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const inputRef = useRef(null);
  const decimalPlaces = Number(settings?.decimalPlaces) || 2;
  const [expression, setExpression] = useState('');

  useEffect(() => {
    if (!open) return;
    const seed = String(initialValue ?? '').trim();
    setExpression(seed);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return undefined;
    const focusInput = () => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select?.();
    };
    const t0 = window.setTimeout(focusInput, 0);
    const t1 = window.setTimeout(focusInput, 50);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [open]);

  const preview = useMemo(() => {
    const value = evalExpression(expression);
    if (value == null) return null;
    if (!allowNegative && value < 0) return null;
    return formatResult(value, decimalPlaces);
  }, [expression, allowNegative, decimalPlaces]);

  const apply = useCallback(() => {
    const value = evalExpression(expression);
    if (value == null) return;
    if (!allowNegative && value < 0) return;
    onApply?.(formatResult(value, decimalPlaces));
  }, [allowNegative, decimalPlaces, expression, onApply]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        apply();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, apply]);

  function pressKey(key) {
    if (key === 'C') {
      clearAll();
      return;
    }
    if (key === '⌫') {
      backspace();
      return;
    }
    appendToken(key);
  }

  function appendToken(token) {
    setExpression((prev) => `${prev}${token}`);
    inputRef.current?.focus();
  }

  function backspace() {
    setExpression((prev) => prev.slice(0, -1));
    inputRef.current?.focus();
  }

  function clearAll() {
    setExpression('');
    inputRef.current?.focus();
  }

  function handleExpressionChange(e) {
    const next = toWesternDigits(e.target.value).replace(/[^\d+\-*/().%\s]/g, '');
    setExpression(next);
  }

  return (
    <PartyModal
      open={open}
      title={t('calc_title')}
      onClose={onClose}
      className="dc-calc-modal"
    >
      <div className="dc-calc">
        <p className="dc-muted text-sm">{t('calc_hint')}</p>

        <label className="dc-calc-label">{t('calc_expression')}</label>
        <input
          ref={inputRef}
          type="text"
          className="dc-calc-display dc-num"
          value={expression}
          onChange={handleExpressionChange}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="dc-calc-result-row">
          <span className="dc-calc-result-label">{t('calc_result')}</span>
          <strong className={`dc-calc-result-value${preview ? '' : ' is-empty'}`}>
            {preview || '—'}
          </strong>
        </div>

        <div className="dc-calc-keypad">
          {KEYPAD_ROWS.flat().map((item) => (
            <button
              key={item.key}
              type="button"
              className={[
                'dc-calc-key',
                item.op ? 'is-op' : '',
                item.wide ? 'is-wide' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => pressKey(item.key)}
            >
              {item.icon ? <i className={item.icon} aria-hidden="true" /> : (item.labelKey ? t(item.labelKey) : item.key)}
            </button>
          ))}
        </div>

        <div className="dc-calc-actions">
          <button type="button" className="dc-ghost" onClick={onClose}>
            {t('btn_cancel')}
          </button>
          <button
            type="button"
            className="dc-success"
            onClick={apply}
            disabled={!preview}
          >
            {t('calc_apply')} <span className="dc-calc-kbd">Ctrl+Enter</span>
          </button>
        </div>
      </div>
    </PartyModal>
  );
}
