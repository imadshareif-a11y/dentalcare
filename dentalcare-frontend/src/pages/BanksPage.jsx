import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import PartyModal from '../components/PartyModal';
import { BankAccountForm, BankCatalogForm, CheckbookIssueForm } from '../components/BankForms';

const ACCOUNT_KINDS = [
  { kind: 'CURRENT', labelKey: 'bank_accounts_section_current' },
  { kind: 'COLLECTION', labelKey: 'bank_accounts_section_collection' },
  { kind: 'PAYMENT', labelKey: 'bank_accounts_section_payment' },
  { kind: 'SAVINGS', labelKey: 'bank_accounts_section_savings' },
];

const ISSUING_CHECKBOOK_KINDS = new Set(['CURRENT', 'PAYMENT']);

export default function BanksPage({ canEdit = true, onAccountsChanged }) {
  const { t, i18n } = useTranslation();
  const [panel, setPanel] = useState('accounts'); // accounts | catalog
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('account'); // account | bank | checkbook
  const [editing, setEditing] = useState(null);
  const [checkbookAccount, setCheckbookAccount] = useState(null);
  const [defaultKind, setDefaultKind] = useState('CURRENT');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRows, bankRows, curs] = await Promise.all([
        api.get('/bank-accounts', { includeInactive: '1' }),
        api.get('/banks', { includeInactive: '1' }),
        api.get('/currencies'),
      ]);
      setAccounts(Array.isArray(accRows) ? accRows : []);
      setBanks(Array.isArray(bankRows) ? bankRows : []);
      setCurrencies(Array.isArray(curs) ? curs.filter((c) => c.is_active !== false) : []);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const accountsByKind = useMemo(() => {
    const map = {};
    for (const k of ACCOUNT_KINDS) map[k.kind] = [];
    for (const row of accounts) {
      if (!map[row.account_kind]) map[row.account_kind] = [];
      map[row.account_kind].push(row);
    }
    return map;
  }, [accounts]);

  function displayName(row) {
    if (i18n.language === 'en' && row.name_en) return row.name_en;
    if (i18n.language === 'he' && row.name_he) return row.name_he;
    return row.name;
  }

  function openAddAccount(kind) {
    setModalMode('account');
    setEditing(null);
    setDefaultKind(kind);
    setModalOpen(true);
  }

  function openEditAccount(row) {
    setModalMode('account');
    setEditing(row);
    setDefaultKind(row.account_kind);
    setModalOpen(true);
  }

  function openIssueCheckbook(row) {
    setModalMode('checkbook');
    setCheckbookAccount(row);
    setEditing(null);
    setModalOpen(true);
  }

  function openAddBank() {
    setModalMode('bank');
    setEditing(null);
    setModalOpen(true);
  }

  function openEditBank(row) {
    setModalMode('bank');
    setEditing(row);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setCheckbookAccount(null);
  }

  async function handleSaved() {
    await load();
    onAccountsChanged?.();
    closeModal();
  }

  return (
    <div className="space-y-4">
      <div>
        <h3>{t('banks_page_title')}</h3>
        <p className="dc-muted text-sm">{t('banks_page_hint')}</p>
      </div>

      <div className="dc-form-row" style={{ gap: 8 }}>
        <button
          type="button"
          className={`dc-chip ${panel === 'accounts' ? 'is-active accounts' : ''}`}
          onClick={() => setPanel('accounts')}
        >
          {t('banks_panel_accounts')}
        </button>
        <button
          type="button"
          className={`dc-chip ${panel === 'catalog' ? 'is-active accounts' : ''}`}
          onClick={() => setPanel('catalog')}
        >
          {t('banks_panel_catalog')}
        </button>
      </div>

      {loading && <div>{t('ledger_loading')}</div>}
      {error && <div className="dc-error">{error}</div>}

      {!loading && panel === 'accounts' && (
        <div className="space-y-6">
          {ACCOUNT_KINDS.map(({ kind, labelKey }) => (
            <section key={kind} className="space-y-2">
              <div className="dc-party-head">
                <h4>{t(labelKey)}</h4>
                {canEdit && (
                  <button
                    type="button"
                    className="dc-icon-btn"
                    onClick={() => openAddAccount(kind)}
                    title={t('bank_account_add')}
                  >
                    <i className="fa-solid fa-plus" />
                  </button>
                )}
              </div>
              {(accountsByKind[kind] || []).length === 0 ? (
                <div className="dc-muted text-sm">{t('bank_account_none_yet')}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th>{t('bank_account_name')}</th>
                      <th>{t('bank_linked')}</th>
                      <th>{t('bank_account_number')}</th>
                      <th>{t('doc_currency')}</th>
                      <th>{t('cash_box_account_code')}</th>
                      <th>{t('currency_status')}</th>
                      {canEdit && <th>{t('party_col_actions')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(accountsByKind[kind] || []).map((row) => (
                      <tr key={row.id}>
                        <td><strong>{displayName(row)}</strong></td>
                        <td>
                          {row.bank_number
                            ? `${row.bank_number} — ${row.bank_name || ''}`
                            : '—'}
                        </td>
                        <td>{row.account_number || '—'}</td>
                        <td>{row.currency_code || '—'}</td>
                        <td>{row.account_code}</td>
                        <td>
                          {row.is_active
                            ? <span className="dc-badge dc-badge-emerald">{t('currency_active')}</span>
                            : <span className="dc-badge dc-badge-amber">{t('currency_inactive')}</span>}
                        </td>
                        {canEdit && (
                          <td>
                            <div className="dc-doc-view-actions">
                              <button
                                type="button"
                                className="dc-icon-btn dc-icon-btn-sm"
                                onClick={() => openEditAccount(row)}
                                title={t('party_edit')}
                              >
                                <i className="fa-solid fa-pen" />
                              </button>
                              {ISSUING_CHECKBOOK_KINDS.has(kind) && (
                                <button
                                  type="button"
                                  className="dc-icon-btn dc-icon-btn-sm"
                                  onClick={() => openIssueCheckbook(row)}
                                  title={t('checkbook_issue')}
                                >
                                  <i className="fa-solid fa-book" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </div>
      )}

      {!loading && panel === 'catalog' && (
        <div className="space-y-3">
          <div className="dc-party-head">
            <h4>{t('banks_catalog_title')}</h4>
            {canEdit && (
              <button type="button" className="dc-icon-btn" onClick={openAddBank} title={t('bank_add')}>
                <i className="fa-solid fa-plus" />
              </button>
            )}
          </div>
          <p className="dc-muted text-sm">{t('banks_catalog_hint')}</p>
          {banks.length === 0 ? (
            <div className="dc-muted text-sm">{t('bank_none_yet')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>{t('bank_number')}</th>
                  <th>{t('bank_name')}</th>
                  <th>{t('currency_status')}</th>
                  {canEdit && <th>{t('party_col_actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {banks.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.bank_number}</strong></td>
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
                          onClick={() => openEditBank(row)}
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
        </div>
      )}

      {canEdit && (
        <PartyModal
          open={modalOpen}
          title={
            modalMode === 'checkbook'
              ? t('checkbook_issue')
              : modalMode === 'bank'
                ? (editing ? t('bank_edit') : t('bank_add'))
                : (editing ? t('bank_account_edit') : t('bank_account_add'))
          }
          onClose={closeModal}
        >
          {modalMode === 'checkbook' ? (
            <CheckbookIssueForm account={checkbookAccount} onSaved={handleSaved} />
          ) : modalMode === 'bank' ? (
            <BankCatalogForm record={editing} onSaved={handleSaved} />
          ) : (
            <BankAccountForm
              record={editing}
              banks={banks.filter((b) => b.is_active !== false)}
              currencies={currencies}
              defaultKind={defaultKind}
              onSaved={handleSaved}
            />
          )}
        </PartyModal>
      )}
    </div>
  );
}
