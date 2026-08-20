import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { formatDate, parseDateInput } from '../utils/format';

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
}) {
  const { settings } = useSettings();
  const fmt = settings.dateFormat || 'DD/MM/YYYY';
  const [text, setText] = useState(() => (value ? formatDate(value, settings) : ''));

  useEffect(() => {
    setText(value ? formatDate(value, settings) : '');
  }, [value, fmt]);

  function emit(iso) {
    onChange?.(iso);
  }

  function handleTextChange(e) {
    const raw = e.target.value;
    setText(raw);
    const iso = parseDateInput(raw, settings);
    if (iso) emit(iso);
    else if (!raw.trim()) emit('');
  }

  function handleBlur() {
    if (!text.trim()) {
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

  return (
    <div className={`dc-date-field ${className}`.trim()}>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={fmt}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        aria-label={fmt}
      />
      <input
        type="date"
        className="dc-date-picker"
        value={value || ''}
        onChange={handlePicker}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
