import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PartyModal from '../components/PartyModal';
import CashBoxForm from '../components/CashBoxForm';

function kindLabelKey(kind) {
  if (kind === 'CASH') return 'cash_box_kind_cash';
  if (kind === 'CHECKS_IN') return 'cash_box_kind_checks_in';
  return 'cash_box_kind_checks_out';
}

function BoxTable({ rows, canEdit, onEdit, t, i18n }) {
  function displayName(row) {
    const lang = i18n.language;
    if (lang === 'en' && row.name_en) return row.name_en;
    if (lang === 'he' && row.name_he) return row.name_he;
    return row.name;
  }

  if (rows.length === 0) {
    return <div className="dc-muted text-sm">{t('cash_box_none_yet')}</div>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th>{t('cash_box_name')}</th>
          <th>{t('doc_currency')}</th>
          <th>{t('cash_box_account_code')}</th>
          <th>{t('cash_box_kind')}</th>
          <th>{t('currency_status')}</th>
          {canEdit && <th>{t('party_col_actions')}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{displayName(row)}</strong>
              {row.is_system && (
                <span className="dc-badge dc-badge-emerald" style={{ marginInlineStart: 6 }}>
                  {t('cash_box_system_badge')}
                </span>
              )}
            </td>
            <td>{row.currency_code} ({row.currency_symbol})</td>
            <td>{row.account_code}</td>
            <td>{t(kindLabelKey(row.box_kind))}</td>
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
                  onClick={() => onEdit(row)}
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
  );
}

export default function CashBoxes({ canEdit = true, onAccountsChanged }) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [defaultKind, setDefaultKind] = useState('CASH');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [boxes, curs] = await Promise.all([
        api.get('/cash-boxes', { includeInactive: '1' }),
        api.get('/currencies'),
      ]);
      setRows(Array.isArray(boxes) ? boxes : []);
      setCurrencies(Array.isArray(curs) ? curs.filter((c) => c.is_active !== false) : []);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const cashRows = useMemo(() => rows.filter((r) => r.box_kind === 'CASH'), [rows]);
  const checkRows = useMemo(
    () => rows.filter((r) => r.box_kind === 'CHECKS_IN' || r.box_kind === 'CHECKS_OUT'),
    [rows]
  );

  function openAdd(kind) {
    setEditing(null);
    setDefaultKind(kind);
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setDefaultKind(row.box_kind);
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
    <div className="space-y-6">
      <div>
        <h3>{t('cash_boxes_title')}</h3>
        <p className="dc-muted text-sm">{t('cash_boxes_hint')}</p>
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}

      {!loading && (
        <>
          <section className="space-y-3">
            <div className="dc-party-head">
              <h4>{t('cash_boxes_cash_section')}</h4>
              {canEdit && (
                <button
                  type="button"
                  className="dc-icon-btn"
                  onClick={() => openAdd('CASH')}
                  title={t('cash_box_add')}
                >
                  <i className="fa-solid fa-plus" />
                </button>
              )}
            </div>
            <BoxTable rows={cashRows} canEdit={canEdit} onEdit={openEdit} t={t} i18n={i18n} />
          </section>

          <section className="space-y-3">
            <div className="dc-party-head">
              <h4>{t('cash_boxes_checks_section')}</h4>
              {canEdit && (
                <button
                  type="button"
                  className="dc-icon-btn"
                  onClick={() => openAdd('CHECKS_IN')}
                  title={t('cash_box_add')}
                >
                  <i className="fa-solid fa-plus" />
                </button>
              )}
            </div>
            <BoxTable rows={checkRows} canEdit={canEdit} onEdit={openEdit} t={t} i18n={i18n} />
          </section>
        </>
      )}

      {canEdit && (
        <PartyModal
          open={modalOpen}
          title={editing ? t('cash_box_edit') : t('cash_box_add')}
          onClose={closeModal}
        >
          <CashBoxForm
            record={editing}
            currencies={currencies}
            defaultKind={defaultKind}
            onSaved={handleSaved}
          />
        </PartyModal>
      )}
    </div>
  );
}
