import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PartyModal from '../components/PartyModal';
import AssetAccountForm from '../components/AssetAccountForm';

export default function AssetAccounts({ canEdit = true, onAccountsChanged }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/asset-accounts', { includeInactive: '1' });
      setRows(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  function displayName(row) {
    const lang = i18n.language;
    if (lang === 'en' && row.account_name_en) return row.account_name_en;
    if (lang === 'he' && row.account_name_he) return row.account_name_he;
    return row.account_name_ar || row.account_name;
  }

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
        <h3>{t('asset_accounts_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={openAdd} title={t('asset_account_add')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>
      <p className="dc-muted text-sm">{t('asset_accounts_hint')}</p>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && rows.length === 0 && <div>{t('asset_accounts_none_yet')}</div>}

      {!loading && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('asset_account_code')}</th>
              <th>{t('asset_account_name')}</th>
              <th>{t('currency_status')}</th>
              {canEdit && <th>{t('party_col_actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.account_code}</strong></td>
                <td>{displayName(row)}</td>
                <td>
                  {row.is_active
                    ? <span className="dc-badge dc-badge-emerald">{t('currency_active')}</span>
                    : <span className="dc-badge dc-badge-amber">{t('currency_inactive')}</span>}
                </td>
                {canEdit && (
                  <td>
                    <button
                      type="button"
                      className="dc-icon-btn dc-icon-btn-sm"
                      onClick={() => openEdit(row)}
                      title={t('party_edit')}
                    >
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
          title={editing ? t('asset_account_edit') : t('asset_account_add')}
          onClose={closeModal}
        >
          <AssetAccountForm record={editing} onSaved={handleSaved} />
        </PartyModal>
      )}
    </div>
  );
}
