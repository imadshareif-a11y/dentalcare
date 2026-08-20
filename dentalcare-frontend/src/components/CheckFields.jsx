import { useTranslation } from 'react-i18next';
import { useBanksCatalog } from '../hooks/useBanksCatalog';
import CheckImageAttach from './CheckImageAttach';

export default function CheckFields({ check, onChange, showAmount = false, currencies = [], allowImages = true }) {
  const { t, i18n } = useTranslation();
  const { findByNumber } = useBanksCatalog();

  function update(field, value) {
    onChange({ ...check, [field]: value });
  }

  function bankDisplayName(bank) {
    if (!bank) return '';
    if (i18n.language === 'en' && bank.name_en) return bank.name_en;
    if (i18n.language === 'he' && bank.name_he) return bank.name_he;
    return bank.name;
  }

  function handleBankNumberChange(raw) {
    const bankNumber = raw;
    const matched = findByNumber(bankNumber);
    onChange({
      ...check,
      bankNumber,
      bankName: matched ? bankDisplayName(matched) : '',
      bankMatched: Boolean(matched),
    });
  }

  return (
    <div className="dc-check-fields">
      {showAmount && (
        <input
          type="number" min="0" step="0.01" placeholder={t('amount')}
          value={check.amount || ''} onChange={(e) => update('amount', e.target.value)} required
        />
      )}
      {showAmount && currencies.length > 0 && (
        <select
          value={check.currencyId || ''}
          onChange={(e) => update('currencyId', e.target.value)}
          required
          aria-label={t('doc_currency')}
        >
          <option value="">{t('doc_currency_choose')}</option>
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.symbol}
            </option>
          ))}
        </select>
      )}
      <input
        type="text" placeholder={t('check_number')}
        value={check.checkNumber || ''} onChange={(e) => update('checkNumber', e.target.value)} required
      />
      <input
        type="text"
        placeholder={t('check_bank_number')}
        value={check.bankNumber || ''}
        onChange={(e) => handleBankNumberChange(e.target.value)}
        required
        aria-label={t('check_bank_number')}
      />
      <input
        type="text"
        placeholder={t('check_bank')}
        value={check.bankName || ''}
        onChange={(e) => update('bankName', e.target.value)}
        readOnly={Boolean(check.bankMatched)}
        required
        title={check.bankMatched ? t('check_bank_auto_filled') : undefined}
      />
      <input
        type="date" placeholder={t('check_due_date')}
        value={check.dueDate || ''} onChange={(e) => update('dueDate', e.target.value)} required
      />
      <input
        type="text" placeholder={t('check_drawer')}
        value={check.drawerName || ''} onChange={(e) => update('drawerName', e.target.value)}
      />
      {allowImages && (
        <CheckImageAttach check={check} onChange={onChange} />
      )}
    </div>
  );
}
