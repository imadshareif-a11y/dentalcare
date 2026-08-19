// pages/Patients.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PatientForm from '../components/PatientForm';

export default function Patients({ canEdit = true, onAccountsChanged }) {
  const { t } = useTranslation();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/patients');
      setPatients(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  async function handleRegistered() {
    await loadPatients();
    // مريض جديد = حساب جديد بشجرة الحسابات؛ لازم قائمة الحسابات
    // بباقي النموذج (سند القبض) تتحدث كمان عشان يطلع فيها فورًا
    onAccountsChanged?.();
  }

  return (
    <div className="space-y-4">
      {canEdit && <PatientForm onRegistered={handleRegistered} />}

      <h3>{t('patient_list_title')}</h3>
      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div style={{ color: 'crimson' }}>{error}</div>}
      {!loading && patients.length === 0 && <div>{t('patient_none_yet')}</div>}

      {!loading && patients.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('patient_name')}</th>
              <th>{t('patient_phone')}</th>
              <th>{t('patient_balance')}</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.phone || '—'}</td>
                <td>{Number(p.balance).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
