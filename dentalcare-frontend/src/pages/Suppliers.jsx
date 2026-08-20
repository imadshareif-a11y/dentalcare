import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import SupplierForm from '../components/SupplierForm';
import PartyModal from '../components/PartyModal';

export default function Suppliers({ canEdit = true, onAccountsChanged }) {
  const { t } = useTranslation();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/suppliers');
      setSuppliers(data);
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
        <h3>{t('supplier_list_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={openAdd} title={t('supplier_register')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && suppliers.length === 0 && <div>{t('supplier_none_yet')}</div>}

      {!loading && suppliers.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('supplier_name')}</th>
              <th>{t('patient_phone')}</th>
              <th>{t('patient_balance')}</th>
              {canEdit && <th>{t('party_col_actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.phone || '—'}</td>
                <td>{Number(s.balance).toFixed(2)}</td>
                {canEdit && (
                  <td>
                    <button type="button" className="dc-icon-btn dc-icon-btn-sm" onClick={() => openEdit(s)} title={t('party_edit')}>
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
          title={editing ? t('supplier_edit') : t('supplier_register')}
          onClose={closeModal}
        >
          <SupplierForm record={editing} onSaved={handleSaved} />
        </PartyModal>
      )}
    </div>
  );
}
