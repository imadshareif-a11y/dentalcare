import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';
import { formatDate, parseDateInput, toWesternDigits } from '../utils/format';

/**
 * Date field that displays/parses according to clinic settings.dateFormat.
 * Value in/out is always ISO YYYY-MM-DD for the API.
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
  const fmt = settings.dateFormat || 'DD/MM/YYYY';
  const digitsMode = settings.numberDigits === 'eastern' ? 'eastern' : 'western';
  const [text, setText] = useState(() => (value ? formatDate(value, settings) : ''));

  useEffect(() => {
    setText(value ? formatDate(value, settings) : '');
  }, [value, fmt, settings]);

  function emit(iso) {
    onChange?.(iso);
  }

  function handleTextChange(e) {
    const raw = e.target.value;
    setText(raw);
    const iso = parseDateInput(raw, settings);
    if (iso) emit(iso);
    else if (!toWesternDigits(raw).trim()) emit('');
  }

  function handleBlur() {
    if (!toWesternDigits(text).trim()) {
      setText('');
      emit('');
      return;
    }
    const iso = parseDateInput(text, settings);
    if (iso) {
      setText(formatDate(iso, settings));
      emit(iso);
    } else {
      setText(value ? formatDate(value, settings) : '');
    }
  }

  function handlePicker(e) {
    const iso = e.target.value;
    emit(iso);
    setText(iso ? formatDate(iso, settings) : '');
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

  return (
    <div className={`dc-date-field ${className}`.trim()} dir="ltr">
      <input
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
        required={required}
        disabled={disabled}
        aria-label={fmt}
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
    </div>
  );
}
