import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function SearchableSelect({
  value,
  onChange,
  options = [],
  label,
  placeholder,
  required = false,
  disabled = false,
  className = '',
  fieldClassName = '',
  compact = false,
  inputRef: externalInputRef = null,
}) {
  const { t } = useTranslation();
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = (o.searchText || o.label || '').toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  function openList() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }

  function pick(option) {
    onChange?.(option?.value ?? '');
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIndex(0);
    if (value && e.target.value !== (selected?.label || '')) {
      onChange?.('');
    }
  }

  function handleKeyDown(e) {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) {
        pick(filtered[activeIndex]);
      } else if (filtered.length === 1) {
        pick(filtered[0]);
      }
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setActiveIndex(-1);
    }
  }

  const displayValue = open ? query : (selected?.label || '');

  function assignInputRef(el) {
    inputRef.current = el;
    if (typeof externalInputRef === 'function') externalInputRef(el);
    else if (externalInputRef) externalInputRef.current = el;
  }

  const field = (
    <div
      ref={rootRef}
      className={`dc-search-select${compact ? ' dc-search-select-compact' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="dc-search-select-control">
        <input
          ref={assignInputRef}
          type="text"
          className="dc-search-select-input"
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery(selected?.label || '');
            setActiveIndex(filtered.length > 0 ? 0 : -1);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || t('party_account_search_placeholder')}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        <button
          type="button"
          className="dc-search-select-toggle"
          tabIndex={-1}
          disabled={disabled}
          aria-label={t('party_account_search_open')}
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
              setActiveIndex(-1);
            } else {
              openList();
              inputRef.current?.focus();
            }
          }}
        >
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} />
        </button>
      </div>

      {required && (
        <input
          tabIndex={-1}
          className="dc-search-select-hidden"
          value={value || ''}
          required
          onChange={() => {}}
        />
      )}

      {open && (
        <ul id={listId} className="dc-search-select-list" role="listbox">
          {filtered.length === 0 ? (
            <li className="dc-search-select-empty">{t('party_account_search_empty')}</li>
          ) : filtered.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={String(option.value) === String(value)}
              className={[
                'dc-search-select-option',
                index === activeIndex ? 'is-active' : '',
                String(option.value) === String(value) ? 'is-selected' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(option)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (label) {
    return (
      <div className={`dc-form-field${fieldClassName ? ` ${fieldClassName}` : ''}`.trim()}>
        <label>{label}</label>
        {field}
      </div>
    );
  }

  return field;
}
