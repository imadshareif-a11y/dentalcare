// pages/Doctors.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import DoctorForm from '../components/DoctorForm';

const COMPENSATION_LABEL_KEY = {
  SALARY: 'doctor_compensation_salary',
  PERCENTAGE: 'doctor_compensation_percentage',
  PARTNER: 'doctor_compensation_partner',
};

export default function Doctors({ canEdit = true, onAccountsChanged }) {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/doctors');
      setDoctors(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  async function handleRegistered() {
    await loadDoctors();
    onAccountsChanged?.();
  }

  return (
    <div className="space-y-4">
      {canEdit && <DoctorForm onRegistered={handleRegistered} />}

      <h3>{t('doctor_list_title')}</h3>
      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!loading && doctors.length === 0 && <div>{t('doctor_none_yet')}</div>}

      {!loading && doctors.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('doctor_name')}</th>
              <th>{t('doctor_phone')}</th>
              <th>{t('doctor_compensation_type')}</th>
              <th>{t('doctor_balance')}</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.phone || '—'}</td>
                <td>
                  {t(COMPENSATION_LABEL_KEY[d.compensation_type])}
                  {d.compensation_type === 'PERCENTAGE' && ` (${d.percentage_rate}%)`}
                  {d.compensation_type === 'SALARY' && ` (${Number(d.monthly_salary).toFixed(2)})`}
                </td>
                <td>{Number(d.balance).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
