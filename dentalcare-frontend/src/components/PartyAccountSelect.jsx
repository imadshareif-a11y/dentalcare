import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SearchableSelect from './SearchableSelect';
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
  compact = false,
}) {
  const { t } = useTranslation();
  const list = accountList ?? partyAccounts(accounts);

  const options = useMemo(
    () => list.map((a) => ({
      value: a.id,
      label: accountOptionLabel(a, t),
      searchText: accountSearchText(a, t),
    })),
    [list, t]
  );

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      label={label}
      required={required}
      disabled={disabled}
      placeholder={placeholder ?? t('voucher_choose_account')}
      className={className}
      compact={compact}
    />
  );
}
