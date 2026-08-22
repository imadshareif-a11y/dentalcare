// pages/Doctors.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import DoctorForm from '../components/DoctorForm';
import PartyModal from '../components/PartyModal';
import { useSettings } from '../context/SettingsContext';

const COMPENSATION_LABEL_KEY = {
  SALARY: 'doctor_compensation_salary',
  PERCENTAGE: 'doctor_compensation_percentage',
  PARTNER: 'doctor_compensation_partner',
};

export default function Doctors({ canEdit = true, onAccountsChanged }) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSaved() {
    await loadDoctors();
    onAccountsChanged?.();
    closeModal();
  }

  return (
    <div className="space-y-4">
      <div className="dc-party-head">
        <h3>{t('doctor_list_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={openAdd} title={t('doctor_register')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && doctors.length === 0 && <div>{t('doctor_none_yet')}</div>}

      {!loading && doctors.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('doctor_name')}</th>
              <th>{t('doctor_phone')}</th>
              <th>{t('doctor_compensation_type')}</th>
              <th>{t('doctor_balance')}</th>
              {canEdit && <th>{t('party_col_actions')}</th>}
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
                  {d.compensation_type === 'SALARY' && ` (${money(d.monthly_salary)})`}
                </td>
                <td className="dc-money">{money(d.balance)}</td>
                {canEdit && (
                  <td>
                    <button type="button" className="dc-icon-btn dc-icon-btn-sm" onClick={() => openEdit(d)} title={t('party_edit')}>
                      <i className="fa-solid fa-pen" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <PartyModal
          open={modalOpen}
          title={editing ? t('doctor_edit') : t('doctor_register')}
          onClose={closeModal}
        >
          <DoctorForm record={editing} onSaved={handleSaved} />
        </PartyModal>
      )}
    </div>
  );
}
