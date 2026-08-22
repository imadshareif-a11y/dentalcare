import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import EmployeeForm from '../components/EmployeeForm';
import PartyModal from '../components/PartyModal';
import { useSettings } from '../context/SettingsContext';

export default function Employees({ canEdit = true, onAccountsChanged }) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/employees');
      setEmployees(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

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
    await load();
    onAccountsChanged?.();
    closeModal();
  }

  return (
    <div className="space-y-4">
      <div className="dc-party-head">
        <h3>{t('employee_list_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={openAdd} title={t('employee_register')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && employees.length === 0 && <div>{t('employee_none_yet')}</div>}

      {!loading && employees.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('employee_name')}</th>
              <th>{t('patient_phone')}</th>
              <th>{t('patient_balance')}</th>
              {canEdit && <th>{t('party_col_actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.phone || '—'}</td>
                <td className="dc-money">{money(row.balance)}</td>
                {canEdit && (
                  <td>
                    <button type="button" className="dc-icon-btn dc-icon-btn-sm" onClick={() => openEdit(row)} title={t('party_edit')}>
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
          title={editing ? t('employee_edit') : t('employee_register')}
          onClose={closeModal}
        >
          <EmployeeForm record={editing} onSaved={handleSaved} />
        </PartyModal>
      )}
    </div>
  );
}
