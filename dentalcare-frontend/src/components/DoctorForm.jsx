// components/DoctorForm.jsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';

export default function DoctorForm({ onRegistered }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [compensationType, setCompensationType] = useState('SALARY');
  const [percentageRate, setPercentageRate] = useState('');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

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
      const result = await api.post('/doctors', {
        name: name.trim(),
        phone,
        compensationType,
        percentageRate: compensationType === 'PERCENTAGE' ? Number(percentageRate) : undefined,
        monthlySalary: compensationType === 'SALARY' ? Number(monthlySalary) : undefined,
      });
      setName('');
      setPhone('');
      setPercentageRate('');
      setMonthlySalary('');
      setCompensationType('SALARY');
      onRegistered?.(result);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3>{t('doctor_register')}</h3>
      <input
        type="text" placeholder={t('doctor_name')}
        value={name} onChange={(e) => setName(e.target.value)} required
      />
      <input
        type="text" placeholder={t('doctor_phone')}
        value={phone} onChange={(e) => setPhone(e.target.value)}
      />

      <div>
        <label>{t('doctor_compensation_type')}</label>
        <select value={compensationType} onChange={(e) => setCompensationType(e.target.value)}>
          <option value="SALARY">{t('doctor_compensation_salary')}</option>
          <option value="PERCENTAGE">{t('doctor_compensation_percentage')}</option>
          <option value="PARTNER">{t('doctor_compensation_partner')}</option>
        </select>
      </div>

      {compensationType === 'PERCENTAGE' && (
        <input
          type="number" min="0" max="100" step="0.5" placeholder={t('doctor_percentage_rate')}
          value={percentageRate} onChange={(e) => setPercentageRate(e.target.value)} required
        />
      )}

      {compensationType === 'SALARY' && (
        <input
          type="number" min="0" step="0.01" placeholder={t('doctor_monthly_salary')}
          value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} required
        />
      )}

      {error && <div style={{ color: 'crimson', fontWeight: 'bold' }}>{error}</div>}

      <button type="submit" disabled={submitting}>
        {submitting ? t('doctor_registering') : t('doctor_register')}
      </button>
    </form>
  );
}
