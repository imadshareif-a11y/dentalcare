import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PartyAccountPickerModal from './PartyAccountPickerModal';
import {
  accountOptionLabel,
  partyAccounts,
} from '../lib/partyAccounts';

export default function PartyAccountSelect({
  accounts,
  accountList,
  value,
  onChange,
  label,
  required = false,
  disabled = false,
  placeholder,
  className = '',
  fieldClassName = 'dc-field-party',
  compact = false,
  pickerScope = 'party',
  hideHint = false,
  inputRef = null,
}) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const displayRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const list = accountList ?? partyAccounts(accounts);

  const allowedAccountIds = useMemo(
    () => list.map((a) => a.id),
    [list]
  );

  const selectedAccount = useMemo(
    () => list.find((a) => String(a.id) === String(value)),
    [list, value]
  );

  const displayLabel = selectedAccount
    ? (selectedAccount.pickerLabel || accountOptionLabel(selectedAccount, t))
    : '';

  useEffect(() => {
    if (typeof inputRef === 'function') {
      inputRef(displayRef.current);
      return () => inputRef(null);
    }
    if (inputRef) {
      inputRef.current = displayRef.current;
    }
  }, [inputRef]);

  useEffect(() => {
    if (disabled) return undefined;

    function onF4(e) {
      if (e.key !== 'F4') return;
      if (!wrapRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      setPickerOpen(true);
    }

    window.addEventListener('keydown', onF4);
    return () => window.removeEventListener('keydown', onF4);
  }, [disabled]);

  function openPicker() {
    if (disabled) return;
    setPickerOpen(true);
  }

  return (
    <div
      ref={wrapRef}
      className={`dc-form-field ${fieldClassName}`.trim()}
    >
      {label && <label>{label}</label>}
      <div className={`dc-party-select-row${compact ? ' is-compact' : ''}`}>
        <button
          ref={displayRef}
          type="button"
          className={[
            'dc-party-account-display',
            compact ? 'is-compact' : '',
            className,
            !displayLabel ? 'is-empty' : '',
          ].filter(Boolean).join(' ')}
          disabled={disabled}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
        >
          <span className="dc-party-account-display-text">
            {displayLabel || (placeholder ?? t('voucher_choose_account'))}
          </span>
        </button>
        {!required && value && !disabled && (
          <button
            type="button"
            className="dc-icon-btn dc-party-clear-btn"
            title={t('clinical_clear_patient')}
            aria-label={t('clinical_clear_patient')}
            onClick={() => onChange('')}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className="dc-icon-btn dc-party-picker-btn"
          disabled={disabled}
          title={`${t('party_picker_open')} (F4)`}
          aria-label={t('party_picker_open')}
          onClick={openPicker}
        >
          <i className="fa-solid fa-table-list" aria-hidden="true" />
        </button>
      </div>
      {required && (
        <input
          tabIndex={-1}
          className="dc-search-select-hidden"
          value={value || ''}
          required
          onChange={() => {}}
          aria-hidden="true"
        />
      )}
      {!disabled && !hideHint && (
        <span className="dc-muted text-sm dc-party-select-hint">{t('party_account_f4_hint')}</span>
      )}
      <PartyAccountPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onChange}
        scope={pickerScope}
        allowedAccountIds={allowedAccountIds}
        selectedAccountId={value}
      />
    </div>
  );
}
