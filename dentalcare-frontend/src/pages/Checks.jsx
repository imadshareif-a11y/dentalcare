// pages/Checks.jsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { partyAccounts } from '../lib/partyAccounts';
import PartyModal from '../components/PartyModal';
import CheckImageViewer from '../components/CheckImageViewer';
import { useSettings } from '../context/SettingsContext';
import PrintHeader, { PrintButton } from '../components/PrintHeader';
import FormattedDateInput from '../components/FormattedDateInput';

const STATUS_LABEL_KEY = {
  PENDING: 'check_status_pending',
  DEPOSITED: 'check_status_deposited',
  CLEARED: 'check_status_cleared',
  BOUNCED: 'check_status_bounced',
  ENDORSED: 'check_status_endorsed',
};

const LOCATION_LABEL_KEY = {
  CHECKS_BOX: 'check_location_box',
  BANK_COLLECTION: 'check_location_collection',
  BANK_CURRENT: 'check_location_current',
  BOUNCED: 'check_location_bounced',
  ENDORSED: 'check_location_endorsed',
};

const EVENT_LABEL_KEY = {
  RECEIVED: 'check_life_received',
  ISSUED: 'check_life_issued',
  DEPOSITED: 'check_life_deposited',
  CLEARED: 'check_life_cleared',
  ENDORSED: 'check_life_endorsed',
  BOUNCED: 'check_life_bounced',
};

function formatActor(actor, t) {
  if (!actor) return null;
  if (actor.name) return actor.name;
  return null;
}

function formatPlace(place, t) {
  if (!place) return null;
  if (place.kind === 'box') return `${t('check_life_place_box')}: ${place.name || '—'}`;
  if (place.kind === 'collection') return `${t('check_life_place_collection')}: ${place.name || '—'}`;
  if (place.kind === 'bank') return `${t('check_life_place_bank')}: ${place.name || '—'}`;
  if (place.kind === 'endorsed') return `${t('check_life_place_endorsed')}: ${place.name || '—'}`;
  if (place.kind === 'bounced') return t('check_location_bounced');
  if (place.name) return place.name;
  return null;
}

export default function Checks({ canEdit = true, accounts, onAccountsChanged }) {
  const { t, i18n } = useTranslation();
  const { money, date } = useSettings();
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clearingId, setClearingId] = useState(null);
  const [bankAccountId, setBankAccountId] = useState('');
  const [currentBanks, setCurrentBanks] = useState([]);
  const [endorsingId, setEndorsingId] = useState(null);
  const [payeeAccountId, setPayeeAccountId] = useState('');
  const [searchText, setSearchText] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [lifecycle, setLifecycle] = useState(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);

  const payeeAccounts = useMemo(() => {
    const parties = partyAccounts(accounts);
    const expenses = accounts.filter((a) => a.account_type === 'EXPENSE');
    return [...parties, ...expenses];
  }, [accounts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/checks');
      setChecks(data);
      setError(null);
    } catch (err) {
      setError(err.body?.error || t('error_generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/bank-accounts')
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setCurrentBanks(list.filter((r) => r.is_active !== false && r.account_kind === 'CURRENT'));
      })
      .catch(() => setCurrentBanks([]));
  }, []);

  const filteredChecks = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return checks.filter((c) => {
      if (q && !`${c.check_number} ${c.bank_name} ${c.bank_number || ''} ${c.issuer_bank_name || ''} ${c.drawer_name || ''} ${c.cash_box_name || ''} ${c.bank_account_name || ''} ${c.linked_bank_name || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      const due = String(c.due_date || '').slice(0, 10);
      if (dueFrom && due < dueFrom) return false;
      if (dueTo && due > dueTo) return false;
      return true;
    });
  }, [checks, searchText, dueFrom, dueTo]);

  function formatCheckBank(c) {
    const lang = i18n.language;
    let catalogName = c.issuer_bank_name;
    if (lang === 'en' && c.issuer_bank_name_en) catalogName = c.issuer_bank_name_en;
    if (lang === 'he' && c.issuer_bank_name_he) catalogName = c.issuer_bank_name_he;

    const name = (c.bank_name && String(c.bank_name).trim())
      || catalogName
      || c.linked_bank_name
      || '';
    const num = c.bank_number ? String(c.bank_number).trim() : '';

    // لو الاسم المحفوظ هو نفس الرقم فقط، فضّل اسم الكتالوج
    const nameLooksLikeNumber = name && num && name === num;
    const displayName = nameLooksLikeNumber ? (catalogName || c.linked_bank_name || name) : name;

    if (displayName && num && displayName !== num) return `${num} — ${displayName}`;
    if (displayName) return displayName;
    return num || '—';
  }

  function locationPlace(c) {
    if (c.location === 'CHECKS_BOX' || (!c.location && c.status === 'PENDING')) {
      return c.cash_box_name
        || c.holding_account_name
        || c.location_account_name
        || '—';
    }
    if (c.bank_account_name) {
      const bankLabel = c.linked_bank_name
        ? (c.linked_bank_number
          ? `${c.linked_bank_number} — ${c.linked_bank_name}`
          : c.linked_bank_name)
        : (c.linked_bank_number || '');
      return bankLabel
        ? `${c.bank_account_name} (${bankLabel})`
        : c.bank_account_name;
    }
    const lang = i18n.language;
    if (lang === 'en' && c.location_account_name_en) return c.location_account_name_en;
    if (lang === 'he' && c.location_account_name_he) return c.location_account_name_he;
    return c.location_account_name || c.location_account_code || '—';
  }

  function bankOptionLabel(row) {
    const lang = i18n.language;
    let name = row.name;
    if (lang === 'en' && row.name_en) name = row.name_en;
    if (lang === 'he' && row.name_he) name = row.name_he;
    return `${row.account_code || ''} — ${name}`.trim();
  }

  async function openLifecycle(checkId) {
    setLifecycleLoading(true);
    setLifecycle(null);
    try {
      const data = await api.get(`/checks/${checkId}/lifecycle`);
      setLifecycle(data);
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setLifecycleLoading(false);
    }
  }

  async function handleClear(checkId) {
    if (!bankAccountId) return;
    try {
      await api.post(`/checks/${checkId}/clear`, { bankAccountId });
      setClearingId(null);
      setBankAccountId('');
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function handleBounce(checkId) {
    if (!confirm(t('check_confirm_bounce'))) return;
    try {
      await api.post(`/checks/${checkId}/bounce`, {});
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  async function handleEndorse(checkId) {
    if (!payeeAccountId) return;
    try {
      await api.post(`/checks/${checkId}/endorse`, { payeeAccountId });
      setEndorsingId(null);
      setPayeeAccountId('');
      await load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    }
  }

  const canClearReceived = (c) =>
    c.check_type === 'RECEIVED'
    && (c.location === 'BANK_COLLECTION' || c.status === 'DEPOSITED');

  const canClearIssued = (c) =>
    c.check_type === 'ISSUED'
    && c.status === 'PENDING'
    && (c.location === 'CHECKS_BOX' || !c.location);

  const inBox = (c) =>
    c.status === 'PENDING' && (c.location === 'CHECKS_BOX' || !c.location);

  return (
    <div className="space-y-4">
      <div className="dc-party-head no-print">
        <h3>{t('checks_title')}</h3>
        {filteredChecks.length > 0 && <PrintButton />}
      </div>
      <p className="dc-muted text-sm no-print">{t('checks_lifecycle_hint')}</p>
      <p className="dc-muted text-sm no-print">{t('checks_click_hint')}</p>

      <div className="dc-checks-filters no-print">
        <input
          type="text" placeholder={t('check_search_placeholder')}
          value={searchText} onChange={(e) => setSearchText(e.target.value)}
        />
        <label>
          {t('check_filter_due_from')}
          <FormattedDateInput value={dueFrom} onChange={setDueFrom} />
        </label>
        <label>
          {t('check_filter_due_to')}
          <FormattedDateInput value={dueTo} onChange={setDueTo} />
        </label>
      </div>

      {loading && <div className="no-print">{t('ledger_loading')}</div>}
      {error && <div className="dc-error no-print">{error}</div>}
      {!loading && !error && checks.length === 0 && <div className="no-print">{t('checks_none')}</div>}
      {!loading && !error && checks.length > 0 && filteredChecks.length === 0 && (
        <div className="no-print">{t('check_no_results')}</div>
      )}

      {!loading && !error && filteredChecks.length > 0 && (
        <>
          <div className="dc-checks-table-wrap no-print">
            <table className="dc-checks-table text-sm">
              <thead>
                <tr>
                  <th>{t('check_col_number')}</th>
                  <th>{t('check_col_bank')}</th>
                  <th>{t('check_col_due')}</th>
                  <th>{t('check_col_amount')}</th>
                  <th>{t('check_col_location')}</th>
                  <th>{t('check_col_place')}</th>
                  <th>{t('check_col_status')}</th>
                  <th className="no-print">{t('check_images_col')}</th>
                  {canEdit && <th>{t('check_col_actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {filteredChecks.map((c) => (
                  <tr
                    key={c.id}
                    className="dc-check-row"
                    onClick={() => openLifecycle(c.id)}
                  >
                    <td><strong>{c.check_number}</strong></td>
                    <td>{formatCheckBank(c)}</td>
                    <td>{date(c.due_date)}</td>
                    <td className="dc-money">{money(c.amount)}</td>
                    <td>{t(LOCATION_LABEL_KEY[c.location] || 'check_location_box')}</td>
                    <td>{locationPlace(c)}</td>
                    <td>
                      <span className={`dc-badge ${
                        c.status === 'CLEARED' ? 'dc-badge-emerald'
                          : c.status === 'BOUNCED' ? 'dc-badge-rose'
                            : c.status === 'ENDORSED' || c.status === 'DEPOSITED' ? 'dc-badge-amber'
                              : 'dc-badge-emerald'
                      }`}>
                        {t(STATUS_LABEL_KEY[c.status] || 'check_status_pending')}
                      </span>
                    </td>
                    <td className="no-print" onClick={(e) => e.stopPropagation()}>
                      {(c.has_front_image || c.has_back_image) ? (
                        <span className="dc-check-img-badge" title={t('check_images_view')}>
                          <i className="fa-solid fa-image" />
                          {c.has_front_image && c.has_back_image ? '2' : '1'}
                        </span>
                      ) : (
                        <span className="dc-muted">—</span>
                      )}
                    </td>
                    {canEdit && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="dc-check-actions">
                        {canClearReceived(c) && (
                          clearingId === c.id ? (
                            <>
                              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                                <option value="">{t('check_clear_choose_current')}</option>
                                {currentBanks.map((a) => (
                                  <option key={a.id} value={a.id}>{bankOptionLabel(a)}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => handleClear(c.id)} disabled={!bankAccountId}>
                                {t('check_clear')}
                              </button>
                              <button type="button" onClick={() => { setClearingId(null); setBankAccountId(''); }}>
                                {t('btn_cancel')}
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setClearingId(c.id)}>{t('check_clear')}</button>
                          )
                        )}

                        {canClearIssued(c) && (
                          clearingId === c.id ? (
                            <>
                              <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                                <option value="">{t('check_clear_choose_current')}</option>
                                {currentBanks.map((a) => (
                                  <option key={a.id} value={a.id}>{bankOptionLabel(a)}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => handleClear(c.id)} disabled={!bankAccountId}>
                                {t('check_clear')}
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setClearingId(c.id)}>{t('check_clear')}</button>
                          )
                        )}

                        {inBox(c) && c.check_type === 'RECEIVED' && (
                          <>
                            {endorsingId === c.id ? (
                              <>
                                <select value={payeeAccountId} onChange={(e) => setPayeeAccountId(e.target.value)}>
                                  <option value="">{t('check_endorse_choose_payee')}</option>
                                  {payeeAccounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.account_name}</option>
                                  ))}
                                </select>
                                <button type="button" onClick={() => handleEndorse(c.id)} disabled={!payeeAccountId}>
                                  {t('check_endorse')}
                                </button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setEndorsingId(c.id)}>{t('check_endorse')}</button>
                            )}
                            <button type="button" onClick={() => handleBounce(c.id)}>{t('check_bounce')}</button>
                          </>
                        )}

                        {inBox(c) && c.check_type === 'ISSUED' && (
                          <button type="button" onClick={() => handleBounce(c.id)}>{t('check_bounce')}</button>
                        )}
                      </div>
                    </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="print-document dc-print-sheet">
            <PrintHeader
              title={t('checks_title')}
              subtitle={
                dueFrom || dueTo
                  ? t('report_period_range', {
                    from: dueFrom ? date(dueFrom) : '—',
                    to: dueTo ? date(dueTo) : '—',
                  })
                  : undefined
              }
            />
            <table className="w-full text-sm print-table">
              <thead>
                <tr>
                  <th>{t('check_col_number')}</th>
                  <th>{t('check_col_bank')}</th>
                  <th>{t('check_col_due')}</th>
                  <th>{t('check_col_amount')}</th>
                  <th>{t('check_col_location')}</th>
                  <th>{t('check_col_place')}</th>
                  <th>{t('check_col_status')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredChecks.map((c) => (
                  <tr key={`print-${c.id}`}>
                    <td>{c.check_number}</td>
                    <td>{formatCheckBank(c)}</td>
                    <td>{date(c.due_date)}</td>
                    <td className="dc-money">{money(c.amount)}</td>
                    <td>{t(LOCATION_LABEL_KEY[c.location] || 'check_location_box')}</td>
                    <td>{locationPlace(c)}</td>
                    <td>{t(STATUS_LABEL_KEY[c.status] || 'check_status_pending')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <PartyModal
        open={Boolean(lifecycle) || lifecycleLoading}
        title={lifecycle
          ? `${t('check_life_title')} — ${lifecycle.check.checkNumber}`
          : t('check_life_title')}
        onClose={() => { setLifecycle(null); setLifecycleLoading(false); }}
      >
        {lifecycleLoading && <div>{t('ledger_loading')}</div>}
        {lifecycle && (
          <div className="dc-check-life">
            <div className="dc-check-life-summary">
              <div><strong>{t('check_col_bank')}:</strong> {formatCheckBank({
                bank_name: lifecycle.check.bankName,
                bank_number: lifecycle.check.bankNumber,
                issuer_bank_name: lifecycle.check.issuerBankName,
                issuer_bank_name_en: lifecycle.check.issuerBankNameEn,
                issuer_bank_name_he: lifecycle.check.issuerBankNameHe,
              })}</div>
              <div><strong>{t('check_col_amount')}:</strong> {money(lifecycle.check.amount)}</div>
              <div><strong>{t('check_col_due')}:</strong> {date(lifecycle.check.dueDate)}</div>
              <div>
                <strong>{t('check_col_status')}:</strong>{' '}
                {t(STATUS_LABEL_KEY[lifecycle.check.status] || 'check_status_pending')}
              </div>
              <div>
                <strong>{t('check_life_now')}:</strong>{' '}
                {t(LOCATION_LABEL_KEY[lifecycle.check.location] || 'check_location_box')}
                {lifecycle.currentPlace?.name ? ` — ${lifecycle.currentPlace.name}` : ''}
              </div>
            </div>

            <CheckImageViewer
              checkId={lifecycle.check.id}
              hasFrontImage={lifecycle.check.hasFrontImage}
              hasBackImage={lifecycle.check.hasBackImage}
              canUpload={canEdit}
              onUploaded={(side) => {
                setLifecycle((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    check: {
                      ...prev.check,
                      hasFrontImage: side === 'front' ? true : prev.check.hasFrontImage,
                      hasBackImage: side === 'back' ? true : prev.check.hasBackImage,
                    },
                  };
                });
                load();
              }}
            />

            <h4>{t('check_life_timeline')}</h4>
            {lifecycle.timeline.length === 0 ? (
              <div className="dc-muted">{t('check_life_empty')}</div>
            ) : (
              <ol className="dc-check-timeline">
                {lifecycle.timeline.map((ev, i) => {
                  const fromLabel = formatActor(ev.from, t) || formatPlace(ev.from, t);
                  const toLabel = formatActor(ev.to, t) || formatPlace(ev.to, t);
                  const placeLabel = formatPlace(ev.place, t);
                  return (
                    <li key={`${ev.type}-${i}`} className={`dc-check-timeline-item is-${String(ev.type).toLowerCase()}`}>
                      <div className="dc-check-timeline-dot" />
                      <div className="dc-check-timeline-body">
                        <div className="dc-check-timeline-head">
                          <strong>{t(EVENT_LABEL_KEY[ev.type] || 'check_life_event')}</strong>
                          <span>{date(ev.date)}</span>
                        </div>
                        {fromLabel && (
                          <div>{t('check_life_from')}: <strong>{fromLabel}</strong></div>
                        )}
                        {toLabel && (
                          <div>{t('check_life_to')}: <strong>{toLabel}</strong></div>
                        )}
                        {placeLabel && (
                          <div>{t('check_life_place')}: <strong>{placeLabel}</strong></div>
                        )}
                        {ev.memo && <div className="dc-muted text-sm">{ev.memo}</div>}
                        {Array.isArray(ev.lines) && ev.lines.length > 0 && (
                          <details className="dc-check-life-lines">
                            <summary>{t('check_life_lines')}</summary>
                            <ul>
                              {ev.lines.map((line, li) => (
                                <li key={li}>
                                  {line.accountCode} {line.accountName}
                                  {line.partyName ? ` (${line.partyName})` : ''}
                                  {' — '}
                                  {line.debit > 0
                                    ? `${t('check_life_debit')} ${money(line.debit)}`
                                    : `${t('check_life_credit')} ${money(line.credit)}`}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </PartyModal>
    </div>
  );
}
