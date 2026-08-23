import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SearchableSelect from './SearchableSelect';
import PartyAccountPickerModal from './PartyAccountPickerModal';
import {
  accountOptionLabel,
  accountSearchText,
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
  className,
  fieldClassName = 'dc-field-party',
  compact = false,
  pickerScope = 'party',
  hideHint = false,
  inputRef = null,
}) {
  const { t } = useTranslation();
  const wrapRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const list = accountList ?? partyAccounts(accounts);

  const allowedAccountIds = useMemo(
    () => list.map((a) => a.id),
    [list]
  );

  const options = useMemo(
    () => list.map((a) => ({
      value: a.id,
      label: a.pickerLabel || accountOptionLabel(a, t),
      searchText: a.pickerSearch || accountSearchText(a, t),
    })),
    [list, t]
  );

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

  return (
    <div
      ref={wrapRef}
      className={`dc-form-field ${fieldClassName}`.trim()}
    >
      {label && <label>{label}</label>}
      <div className="dc-party-select-row">
        <SearchableSelect
          value={value}
          onChange={onChange}
          options={options}
          required={required}
          disabled={disabled}
          placeholder={placeholder ?? t('voucher_choose_account')}
          className={className}
          compact={compact}
          inputRef={inputRef}
        />
        <button
          type="button"
          className="dc-icon-btn dc-party-picker-btn"
          disabled={disabled}
          title={`${t('party_picker_open')} (F4)`}
          aria-label={t('party_picker_open')}
          onClick={() => setPickerOpen(true)}
        >
          <i className="fa-solid fa-table-list" aria-hidden="true" />
        </button>
      </div>
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
