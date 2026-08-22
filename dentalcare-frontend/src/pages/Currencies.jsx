import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { dedupeByCode } from '../lib/dedupeList';
import PartyModal from '../components/PartyModal';
import CurrencyForm from '../components/CurrencyForm';

export default function Currencies({ canEdit = true }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/currencies');
      setRows(dedupeByCode(Array.isArray(data) ? data : [], 'code', 'id'));
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const baseCurrency = rows.find((r) => r.is_base) || null;

  function displayName(row) {
    const lang = i18n.language;
    if (lang === 'en' && row.name_en) return row.name_en;
    if (lang === 'he' && row.name_he) return row.name_he;
    return row.name;
  }

  function formatRate(row) {
    if (row.is_base) return `1 ${row.code}`;
    const rate = Number(row.rate_to_base);
    const base = baseCurrency?.code || 'ILS';
    return `1 ${row.code} = ${rate} ${base}`;
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
    closeModal();
  }

  return (
    <div className="space-y-4">
      <div className="dc-party-head">
        <h3>{t('currency_list_title')}</h3>
        {canEdit && (
          <button type="button" className="dc-icon-btn" onClick={openAdd} title={t('currency_add')}>
            <i className="fa-solid fa-plus" />
          </button>
        )}
      </div>

      <p className="dc-muted text-sm">{t('currency_list_hint')}</p>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}
      {!loading && rows.length === 0 && <div>{t('currency_none_yet')}</div>}

      {!loading && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>{t('currency_code')}</th>
              <th>{t('currency_name')}</th>
              <th>{t('currency_symbol')}</th>
              <th>{t('currency_rate_column')}</th>
              <th>{t('currency_status')}</th>
              {canEdit && <th>{t('party_col_actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.code}</strong>
                  {row.is_base && <span className="dc-badge dc-badge-emerald" style={{ marginInlineStart: 6 }}>{t('currency_base_badge')}</span>}
                </td>
                <td>{displayName(row)}</td>
                <td>{row.symbol}</td>
                <td>{formatRate(row)}</td>
                <td>
                  {row.is_active
                    ? <span className="dc-badge dc-badge-emerald">{t('currency_active')}</span>
                    : <span className="dc-badge dc-badge-amber">{t('currency_inactive')}</span>}
                </td>
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
          title={editing ? t('currency_edit') : t('currency_add')}
          onClose={closeModal}
        >
          <CurrencyForm record={editing} baseCurrency={baseCurrency} onSaved={handleSaved} />
        </PartyModal>
      )}
    </div>
  );
}
