import { useTranslation } from 'react-i18next';
import FormattedDateInput from './FormattedDateInput';
import PartyVoucherInfo from './PartyVoucherInfo';

/** صف الذمة/الحقل الرئيسي + التاريخ — نفس تخطيط سند القبض */
export default function DocPartyDateRow({
  accountId,
  docDate,
  onDateChange,
  dateRequired = true,
  showPartyInfo = true,
  children,
}) {
  const { t } = useTranslation();
  return (
    <div className="dc-form-row dc-voucher-head-row">
      {children}
      <div className="dc-form-field dc-field-date dc-voucher-date-col dc-doc-party-meta">
        {showPartyInfo && <PartyVoucherInfo accountId={accountId} />}
        <label>{t('voucher_date')}</label>
        <FormattedDateInput value={docDate} onChange={onDateChange} required={dateRequired} />
      </div>
    </div>
  );
}
