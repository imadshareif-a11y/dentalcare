import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';

export default function EmployeeForm({ record, onSaved }) {
  const { t } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const isEdit = Boolean(record?.id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setName(record.name || '');
      setPhone(record.phone || '');
    } else {
      setName('');
      setPhone('');
      setCurrencyId(baseCurrency?.id || '');
    }
    setError(null);
  }, [record, baseCurrency?.id]);

  useEffect(() => {
    if (!isEdit && !currencyId && baseCurrency?.id) {
      setCurrencyId(baseCurrency.id);
    }
  }, [baseCurrency, currencyId, isEdit]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(t('employee_name_required'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone,
        ...(isEdit ? {} : { currencyId: currencyId || null }),
      };
      const result = isEdit
        ? await api.patch(`/employees/${record.id}`, payload)
        : await api.post('/employees', payload);
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="text" className="dc-field-name" placeholder={t('employee_name')} value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="text" className="dc-field-phone" placeholder={t('patient_phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      {!isEdit && (
        <>
          <CurrencySelect
            label={t('account_currency')}
            value={currencyId}
            onChange={setCurrencyId}
            currencies={currencies}
          />
          <p className="dc-muted text-sm">{t('account_currency_default_hint')}</p>
        </>
      )}
      {error && <div className="dc-error">{error}</div>}
      <button type="submit" disabled={submitting}>
        {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('employee_register'))}
      </button>
    </form>
  );
}
