import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useBanksCatalog } from '../hooks/useBanksCatalog';
import CheckImageAttach from './CheckImageAttach';
import FormattedDateInput from './FormattedDateInput';

export default function CheckFields({
  check,
  onChange,
  showAmount = false,
  currencies = [],
  allowImages = true,
  showIssuingAccount = false,
  issuingBankAccounts = [],
}) {
  const { t, i18n } = useTranslation();
  const { findByNumber } = useBanksCatalog();
  const [loadingNext, setLoadingNext] = useState(false);
  const [nextHint, setNextHint] = useState(null);

  function update(field, value) {
    onChange({ ...check, [field]: value });
  }

  function bankDisplayName(bank) {
    if (!bank) return '';
    if (i18n.language === 'en' && bank.name_en) return bank.name_en;
    if (i18n.language === 'he' && bank.name_he) return bank.name_he;
    return bank.name;
  }

  function accountLabel(row) {
    const parts = [row.name];
    if (row.bank_number) parts.push(row.bank_number);
    if (row.account_number) parts.push(row.account_number);
    return parts.join(' — ');
  }

  function handleBankNumberChange(raw) {
    const bankNumber = raw;
    const matched = findByNumber(bankNumber);
    onChange({
      ...check,
      bankNumber,
      bankName: matched ? bankDisplayName(matched) : (check.bankName || ''),
      bankMatched: Boolean(matched),
    });
  }

  async function loadNextForAccount(bankAccountId, baseCheck = check) {
    if (!bankAccountId) {
      setNextHint(null);
      return;
    }
    setLoadingNext(true);
    try {
      const data = await api.get(`/bank-accounts/${bankAccountId}/next-check-number`);
      if (!data?.available) {
        setNextHint(t('checkbook_no_available'));
        onChange({
          ...baseCheck,
          bankAccountId,
          checkbookId: '',
          checkNumber: baseCheck.checkNumber || '',
        });
        return;
      }
      const matched = data.bankNumber ? findByNumber(data.bankNumber) : null;
      setNextHint(
        data.remaining != null
          ? t('checkbook_next_hint', { number: data.checkNumber, remaining: data.remaining })
          : t('checkbook_next_hint_simple', { number: data.checkNumber })
      );
      onChange({
        ...baseCheck,
        bankAccountId,
        checkbookId: data.checkbookId,
        checkNumber: data.checkNumber,
        bankNumber: data.bankNumber || baseCheck.bankNumber || '',
        bankName: data.bankName || (matched ? bankDisplayName(matched) : baseCheck.bankName || ''),
        bankMatched: Boolean(matched || data.bankName),
      });
    } catch {
      setNextHint(t('checkbook_next_load_failed'));
    } finally {
      setLoadingNext(false);
    }
  }

  useEffect(() => {
    if (!showIssuingAccount || !check.bankAccountId) return;
    if (check.checkNumber && check.checkbookId) return;
    loadNextForAccount(check.bankAccountId);
  }, [showIssuingAccount, check.bankAccountId, check.checkNumber, check.checkbookId]);

  return (
    <div className="dc-check-fields">
      {showIssuingAccount && issuingBankAccounts.length > 0 && (
        <select
          value={check.bankAccountId || ''}
          onChange={(e) => loadNextForAccount(e.target.value)}
          required
          aria-label={t('check_issuing_account')}
        >
          <option value="">{t('check_issuing_account_choose')}</option>
          {issuingBankAccounts.map((row) => (
            <option key={row.id} value={row.id}>{accountLabel(row)}</option>
          ))}
        </select>
      )}

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
      {loadingNext && <div className="dc-muted text-sm">{t('ledger_loading')}</div>}
      {!loadingNext && nextHint && <div className="dc-muted text-sm">{nextHint}</div>}
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
      <FormattedDateInput
        value={check.dueDate || ''}
        onChange={(iso) => update('dueDate', iso)}
        required
        placeholder={t('check_due_date')}
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
