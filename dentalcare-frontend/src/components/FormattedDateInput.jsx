import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';
import { formatDate, toWesternDigits } from '../utils/format';
import {
  addDaysToIso,
  clampIsoDate,
  extractDateDigits,
  normalizeDateTyping,
  parseDateInputSmart,
} from '../utils/dateInput';

/**
 * حقل تاريخ تفاعلي: قناع تلقائي، إدخال أرقام متصلة، ↑↓ للتعديل، تقويم.
 * القيمة دائماً ISO YYYY-MM-DD للـ API.
 */
export default function FormattedDateInput({
  value = '',
  onChange,
  required = false,
  disabled = false,
  className = '',
  id,
  name,
  min,
  max,
  placeholder,
}) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const pickerRef = useRef(null);
  const inputRef = useRef(null);
  const prevDigitsRef = useRef('');
  const fmt = settings.dateFormat || 'DD/MM/YYYY';
  const digitsMode = settings.numberDigits === 'eastern' ? 'eastern' : 'western';
  const [text, setText] = useState(() => (value ? formatDate(value, settings) : ''));
  const [status, setStatus] = useState(value ? 'valid' : 'empty');

  useEffect(() => {
    setText(value ? formatDate(value, settings) : '');
    setStatus(value ? 'valid' : 'empty');
    prevDigitsRef.current = value
      ? extractDateDigits(formatDate(value, settings))
      : '';
  }, [value, fmt, settings]);

  function emit(iso) {
    onChange?.(iso);
  }

  function applyIso(iso, displayOverride) {
    const clamped = clampIsoDate(iso, min, max);
    if (!clamped) {
      setText('');
      setStatus('empty');
      emit('');
      return;
    }
    setText(displayOverride ?? formatDate(clamped, settings));
    setStatus('valid');
    emit(clamped);
  }

  function handleTextChange(e) {
    const raw = e.target.value;
    const digits = extractDateDigits(raw);
    const isDeleting = digits.length < prevDigitsRef.current.length;
    prevDigitsRef.current = digits;

    const normalized = normalizeDateTyping(raw, settings, { min, max, isDeleting });
    setText(normalized.display);
    setStatus(normalized.status);

    const cursor = normalized.cursor ?? normalized.display.length;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      try {
        el.setSelectionRange(cursor, cursor);
      } catch {
        // بعض المتصفحات ترفض ضبط المؤشر أثناء blur
      }
    });

    if (normalized.status === 'valid' && normalized.iso) {
      const clamped = clampIsoDate(normalized.iso, min, max);
      if (clamped) emit(clamped);
    } else if (normalized.status === 'empty') {
      emit('');
    }
  }

  function handleBlur() {
    const normalized = normalizeDateTyping(text, settings, {
      min,
      max,
      completeOnBlur: true,
      defaultYear: value ? Number(String(value).slice(0, 4)) : new Date().getFullYear(),
    });

    if (normalized.status === 'valid' && normalized.iso) {
      applyIso(normalized.iso, normalized.display);
      return;
    }

    if (!toWesternDigits(text).trim()) {
      setText('');
      setStatus('empty');
      emit('');
      return;
    }

    const fallback = parseDateInputSmart(text, settings, { min, max, completeOnBlur: true });
    if (fallback) {
      applyIso(fallback);
      return;
    }

    setStatus('invalid');
    setText(value ? formatDate(value, settings) : normalized.display);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const base = parseDateInputSmart(text, settings, { min, max, completeOnBlur: true })
        || value
        || null;
      if (!base) return;
      e.preventDefault();
      const delta = e.key === 'ArrowUp' ? 1 : -1;
      applyIso(addDaysToIso(base, delta));
      return;
    }

    if (e.key === 't' || e.key === 'T') {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const today = new Date();
      const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      e.preventDefault();
      applyIso(iso);
    }
  }

  function handlePicker(e) {
    const iso = e.target.value;
    if (!iso) {
      setText('');
      setStatus('empty');
      emit('');
      return;
    }
    applyIso(iso);
  }

  function openCalendar() {
    if (disabled) return;
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Safari / older browsers
      }
    }
    el.click();
    el.focus();
  }

  const hint = status === 'partial'
    ? t('date_typing_partial')
    : status === 'invalid'
      ? t('date_typing_invalid')
      : '';

  return (
    <div
      className={[
        'dc-date-field',
        status === 'valid' ? 'is-valid' : '',
        status === 'partial' ? 'is-partial' : '',
        status === 'invalid' ? 'is-invalid' : '',
        className,
      ].filter(Boolean).join(' ')}
      dir="ltr"
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        className="dc-date-text dc-num"
        inputMode="numeric"
        autoComplete="off"
        lang={digitsMode === 'western' ? 'en' : 'ar'}
        placeholder={placeholder || fmt}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        required={required}
        disabled={disabled}
        aria-label={fmt}
        aria-invalid={status === 'invalid' ? true : undefined}
        title={hint || t('date_typing_hint')}
      />
      <button
        type="button"
        className="dc-date-calendar-btn"
        onClick={openCalendar}
        disabled={disabled}
        aria-label={t('date_open_calendar')}
        title={t('date_open_calendar')}
      >
        <i className="fa-regular fa-calendar" aria-hidden="true" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        className="dc-date-picker"
        value={value || ''}
        onChange={handlePicker}
        disabled={disabled}
        min={min || undefined}
        max={max || undefined}
        tabIndex={-1}
        aria-hidden="true"
      />
      {hint && !disabled && (
        <span className="dc-date-field-hint">{hint}</span>
      )}
    </div>
  );
}
