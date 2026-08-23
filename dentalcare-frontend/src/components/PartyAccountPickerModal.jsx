import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import PartyModal from './PartyModal';
import { ALL_PARTY_TYPES, partyTypeLabelKey } from '../lib/partyAccounts';

const PARTY_FILTERS = [
  { id: 'ALL', types: ALL_PARTY_TYPES },
  { id: 'PATIENT', types: ['PATIENT'] },
  { id: 'SUPPLIER', types: ['SUPPLIER'] },
  { id: 'DOCTOR', types: ['DOCTOR'] },
  { id: 'EMPLOYEE', types: ['EMPLOYEE'] },
];

function accountTypeLabelKey(accountType) {
  if (accountType === 'EXPENSE') return 'party_picker_account_expense';
  if (accountType === 'REVENUE') return 'party_picker_account_revenue';
  if (accountType === 'ASSET') return 'party_picker_account_asset';
  if (accountType === 'RECEIVABLE') return 'party_picker_account_receivable';
  if (accountType === 'LIABILITY') return 'party_picker_account_liability';
  return null;
}

function PickerTable({ rows, onPick, typeLabelForRow, money, selectedId }) {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return <div className="dc-muted dc-party-picker-empty">{t('party_picker_empty')}</div>;
  }

  return (
    <div className="dc-party-picker-table-wrap">
      <table className="dc-party-picker-table text-sm">
        <thead>
          <tr>
            <th>{t('party_picker_col_code')}</th>
            <th>{t('party_picker_col_name')}</th>
            <th>{t('party_picker_col_type')}</th>
            <th>{t('party_picker_col_balance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const balance = Number(row.balance) || 0;
            const balanceOk = balance <= 0;
            const isSelected = String(row.accountId) === String(selectedId);
            return (
              <tr
                key={row.accountId}
                className={`dc-party-picker-row${isSelected ? ' is-selected' : ''}`}
                onClick={() => onPick(row.accountId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onPick(row.accountId);
                }}
                tabIndex={0}
                role="button"
              >
                <td className="dc-num">{row.accountCode}</td>
                <td>{row.partyName || row.accountName}</td>
                <td>{typeLabelForRow(row)}</td>
                <td className="dc-money">
                  <span className={`dc-balance-chip${balanceOk ? ' is-ok' : ''}`}>
                    {money(balance)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PartyAccountPickerModal({
  open,
  onClose,
  onSelect,
  scope = 'party',
  allowedAccountIds = null,
  selectedAccountId = '',
}) {
  const { t } = useTranslation();
  const { money } = useSettings();
  const searchRef = useRef(null);
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');
  const [parties, setParties] = useState([]);
  const [others, setOthers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const allowedSet = useMemo(() => {
    if (!allowedAccountIds || allowedAccountIds.length === 0) return null;
    return new Set(allowedAccountIds.map(String));
  }, [allowedAccountIds]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/accounts/picker', { scope });
      setParties(Array.isArray(data.parties) ? data.parties : []);
      setOthers(Array.isArray(data.others) ? data.others : []);
    } catch (err) {
      setParties([]);
      setOthers([]);
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setLoading(false);
    }
  }, [scope, t]);

  useEffect(() => {
    if (!open) return;
    setPartyFilter('ALL');
    setSearchText('');
    load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return undefined;
    const focusSearch = () => {
      const el = searchRef.current;
      if (!el) return;
      el.focus();
      el.select?.();
    };
    // بعد رسم المودال مباشرة + مرة ثانية بعد إطار لضمان التركيز
    const t0 = window.setTimeout(focusSearch, 0);
    const t1 = window.setTimeout(focusSearch, 50);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [open]);

  const typeLabelForRow = useCallback((row) => {
    const partyKey = partyTypeLabelKey(row.partyType);
    if (partyKey) return t(partyKey);
    const typeKey = accountTypeLabelKey(row.accountType);
    if (typeKey) return t(typeKey);
    return row.accountType || '—';
  }, [t]);

  const filterRows = useCallback((list) => {
    const filterDef = PARTY_FILTERS.find((f) => f.id === partyFilter) || PARTY_FILTERS[0];
    const typeSet = new Set(filterDef.types);
    const q = searchText.trim().toLowerCase();

    return list.filter((row) => {
      if (allowedSet && !allowedSet.has(String(row.accountId))) return false;
      if (row.partyType && !typeSet.has(row.partyType)) return false;
      if (!q) return true;
      const hay = [
        row.accountCode,
        row.accountName,
        row.partyName,
        typeLabelForRow(row),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [allowedSet, partyFilter, searchText, typeLabelForRow]);

  const filteredParties = useMemo(() => filterRows(parties), [filterRows, parties]);

  const filteredOthers = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return others.filter((row) => {
      if (allowedSet && !allowedSet.has(String(row.accountId))) return false;
      if (!q) return true;
      const hay = [row.accountCode, row.accountName, typeLabelForRow(row)].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [others, allowedSet, searchText, typeLabelForRow]);

  function pick(accountId) {
    onSelect?.(accountId);
    onClose?.();
  }

  return (
    <PartyModal
      open={open}
      wide
      className="dc-party-picker-modal"
      title={t('party_picker_title')}
      onClose={onClose}
    >
      <div className="dc-party-picker">
        <p className="dc-muted text-sm">{t('party_picker_hint')}</p>

        <section className="dc-party-picker-section">
          <h4 className="dc-party-picker-section-title">{t('party_picker_section_parties')}</h4>
          <div className="dc-party-picker-toolbar">
            <div className="dc-party-picker-filters" role="tablist">
              {PARTY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={partyFilter === f.id}
                  className={`dc-party-picker-filter${partyFilter === f.id ? ' is-active' : ''}`}
                  onClick={() => setPartyFilter(f.id)}
                >
                  {t(`party_picker_filter_${f.id.toLowerCase()}`)}
                </button>
              ))}
            </div>
            <input
              ref={searchRef}
              type="search"
              className="dc-field-grow"
              placeholder={t('party_picker_search')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              autoFocus
            />
            <button type="button" className="dc-ghost-light" onClick={load} disabled={loading}>
              {loading ? t('ledger_loading') : t('party_picker_refresh')}
            </button>
          </div>

          {error && <div className="dc-error">{error}</div>}
          {loading && !error && <div className="dc-muted">{t('ledger_loading')}</div>}
          {!loading && !error && (
            <PickerTable
              rows={filteredParties}
              onPick={pick}
              typeLabelForRow={typeLabelForRow}
              money={money}
              selectedId={selectedAccountId}
            />
          )}
        </section>

        {scope === 'extended' && !loading && !error && (
          <section className="dc-party-picker-section dc-party-picker-section-other">
            <h4 className="dc-party-picker-section-title">{t('party_picker_section_other')}</h4>
            <PickerTable
              rows={filteredOthers}
              onPick={pick}
              typeLabelForRow={typeLabelForRow}
              money={money}
              selectedId={selectedAccountId}
            />
          </section>
        )}
      </div>
    </PartyModal>
  );
}
