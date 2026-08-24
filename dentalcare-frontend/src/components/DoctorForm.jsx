// components/DoctorForm.jsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import ClinicNumberInput from './ClinicNumberInput';
import CurrencySelect from './CurrencySelect';
import { useCurrencies } from '../hooks/useCurrencies';

export default function DoctorForm({ record, onSaved, onDeleted }) {
  const { t } = useTranslation();
  const { currencies, baseCurrency } = useCurrencies();
  const isEdit = Boolean(record?.id);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [compensationType, setCompensationType] = useState('SALARY');
  const [percentageRate, setPercentageRate] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setName(record.name || '');
      setPhone(record.phone || '');
      setCompensationType(record.compensation_type || 'SALARY');
      setPercentageRate(record.percentage_rate != null ? String(record.percentage_rate) : '');
      setMonthlySalary(record.monthly_salary != null ? String(record.monthly_salary) : '');
    } else {
      setName('');
      setPhone('');
      setCompensationType('SALARY');
      setPercentageRate('');
      setMonthlySalary('');
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
      setError(t('doctor_name_required'));
      return;
    }
    if (compensationType === 'PERCENTAGE') {
      const rate = Number(percentageRate);
      if (!rate || rate <= 0 || rate > 100) {
        setError(t('doctor_rate_required'));
        return;
      }
    }
    if (compensationType === 'SALARY') {
      const salary = Number(monthlySalary);
      if (!salary || salary <= 0) {
        setError(t('doctor_salary_required'));
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone,
        compensationType,
        percentageRate: compensationType === 'PERCENTAGE' ? Number(percentageRate) : undefined,
        monthlySalary: compensationType === 'SALARY' ? Number(monthlySalary) : undefined,
        ...(isEdit ? {} : { currencyId: currencyId || null }),
      };
      const result = isEdit
        ? await api.patch(`/doctors/${record.id}`, payload)
        : await api.post('/doctors', payload);
      onSaved?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  const canDelete = isEdit && !record?.has_movements;

  async function handleDelete() {
    if (!canDelete || !record?.id) return;
    if (!window.confirm(t('party_confirm_delete', { name: record.name || '' }))) return;
    setError(null);
    setDeleting(true);
    try {
      await api.delete(`/doctors/${record.id}`);
      onDeleted?.();
      onSaved?.({ deleted: true });
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input type="text" className="dc-field-name" placeholder={t('doctor_name')} value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="text" className="dc-field-phone" placeholder={t('doctor_phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
      <div className="dc-form-field dc-field-select-md">
        <label>{t('doctor_compensation_type')}</label>
        <select value={compensationType} onChange={(e) => setCompensationType(e.target.value)}>
          <option value="SALARY">{t('doctor_compensation_salary')}</option>
          <option value="PERCENTAGE">{t('doctor_compensation_percentage')}</option>
          <option value="PARTNER">{t('doctor_compensation_partner')}</option>
        </select>
      </div>
      {compensationType === 'PERCENTAGE' && (
        <ClinicNumberInput
          className="dc-field-percent"
          min="0"
          max="100"
          step="0.5"
          placeholder={t('doctor_percentage_rate')}
          value={percentageRate}
          onChange={setPercentageRate}
          required
        />
      )}
      {compensationType === 'SALARY' && (
        <ClinicNumberInput
          showCurrency
          className="dc-field-amount"
          min="0"
          step="0.01"
          placeholder={t('doctor_monthly_salary')}
          value={monthlySalary}
          onChange={setMonthlySalary}
          required
        />
      )}
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
      {isEdit && record?.has_movements && (
        <p className="dc-muted text-sm">{t('party_delete_blocked_movements')}</p>
      )}
      <div className="dc-form-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        {canDelete ? (
          <button
            type="button"
            className="dc-danger"
            disabled={submitting || deleting}
            onClick={handleDelete}
          >
            {deleting ? t('party_deleting') : t('party_delete')}
          </button>
        ) : <span />}
        <button type="submit" disabled={submitting || deleting}>
          {submitting ? t('party_saving') : (isEdit ? t('party_save') : t('doctor_register'))}
        </button>
      </div>
    </form>
  );
}
