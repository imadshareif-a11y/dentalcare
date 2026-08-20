// pages/Patients.jsx
import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PatientForm from '../components/PatientForm';
import PartyModal from '../components/PartyModal';

export default function Patients({ canEdit = true, onAccountsChanged, onOpenClinical }) {
  const { t } = useTranslation();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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
    await loadPatients();
    onAccountsChanged?.();
    closeModal();
  }

  return (
    <div className="space-y-4">
      <div className="dc-party-head">
        <h3>{t('patient_list_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={openAdd} title={t('patient_register')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && patients.length === 0 && <div>{t('patient_none_yet')}</div>}

      {!loading && patients.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('patient_name')}</th>
              <th>{t('patient_phone')}</th>
              <th>{t('patient_birth_date')}</th>
              <th>{t('patient_age')}</th>
              <th>{t('patient_gender')}</th>
              <th>{t('patient_address')}</th>
              <th>{t('patient_medical_notes')}</th>
              <th>{t('patient_balance')}</th>
              <th>{t('patient_status')}</th>
              {canEdit && <th>{t('party_col_actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <td>
                  {onOpenClinical ? (
                    <button
                      type="button"
                      className="dc-patient-name-link"
                      onClick={() => onOpenClinical(p.id)}
                      title={t('patient_open_clinical')}
                    >
                      {p.name}
                    </button>
                  ) : (
                    p.name
                  )}
                </td>
                <td className="dc-money">{p.phone || '—'}</td>
                <td>{p.birth_date || '—'}</td>
                <td>{p.age != null ? p.age : '—'}</td>
                <td>
                  {p.gender === 'MALE' ? t('patient_gender_male')
                    : p.gender === 'FEMALE' ? t('patient_gender_female')
                      : '—'}
                </td>
                <td>{p.address || '—'}</td>
                <td>{p.medical_notes || '—'}</td>
                <td className={`dc-money ${Number(p.balance) > 0 ? 'is-debt' : 'is-ok'}`}>
                  {Number(p.balance).toFixed(2)}
                </td>
                <td>
                  {Number(p.balance) > 0
                    ? <span className="dc-badge dc-badge-rose">{t('patient_status_due')}</span>
                    : <span className="dc-badge dc-badge-emerald">{t('patient_status_clear')}</span>}
                </td>
                {canEdit && (
                  <td>
                    <button type="button" className="dc-icon-btn dc-icon-btn-sm" onClick={() => openEdit(p)} title={t('party_edit')}>
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
          title={editing ? t('patient_edit') : t('patient_register')}
          onClose={closeModal}
        >
          <PatientForm record={editing} onSaved={handleSaved} />
        </PartyModal>
      )}
    </div>
  );
}
