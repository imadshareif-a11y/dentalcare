import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import LiveKpiValue from '../components/LiveKpiValue';
import PartyModal from '../components/PartyModal';
import CurrencyRatesSummary from '../components/CurrencyRatesSummary';
import CurrencyDailyConfirm from '../components/CurrencyDailyConfirm';
import {
  dashboardErrorMessage,
  relativeUpdated,
  useDashboardLive,
} from '../hooks/useDashboardLive';

const SOURCE_LABEL_KEYS = {
  RECEIPT: 'nav_receipt',
  PAYMENT: 'nav_payment',
  JOURNAL: 'nav_voucher',
  BANK_ENTRY: 'nav_bank_entry',
  PURCHASE_INVOICE: 'nav_purchase_invoice',
  CREDIT_NOTE: 'nav_credit_note',
  DEBIT_NOTE: 'nav_debit_note',
  OPENING: 'admin_source_opening',
  FX_REVALUATION: 'source_fx_revaluation',
};

const AUTH_EVENT_KEYS = {
  LOGIN_SUCCESS: 'admin_auth_login',
  LOGOUT: 'admin_auth_logout',
  LOGIN_FAILED: 'admin_auth_login_failed',
};

const ROLE_KEYS = {
  OWNER: 'user_role_owner',
  ACCOUNTANT: 'user_role_accountant',
  DOCTOR: 'user_role_doctor',
  RECEPTIONIST: 'user_role_receptionist',
};

const KPI_MODAL_TITLES = {
  cash: 'admin_kpi_drill_cash_title',
  receivables: 'admin_kpi_drill_receivables_title',
  payables: 'admin_kpi_drill_payables_title',
  appointments: 'admin_kpi_drill_appointments_title',
  users: 'admin_kpi_drill_users_title',
};

function roleLabel(role, t) {
  const key = ROLE_KEYS[role];
  return key ? t(key) : (role || '—');
}

function formatTime(slot) {
  return String(slot || '').slice(0, 5) || '—';
}

function apptPhaseLabel(phase, t) {
  if (phase === 'now') return t('admin_kpi_drill_appt_now');
  if (phase === 'upcoming') return t('admin_kpi_drill_appt_upcoming');
  if (phase === 'past') return t('admin_kpi_drill_appt_past');
  return '—';
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { money, dateTime } = useSettings();
  const [activityFilter, setActivityFilter] = useState('all');
  const [kpiModal, setKpiModal] = useState(null);
  const [showCurrencyConfirm, setShowCurrencyConfirm] = useState(false);

  const fetchDashboard = useCallback(async () => api.get('/admin/dashboard'), []);
  const {
    data,
    loading,
    refreshing,
    error,
    now,
    flashKey,
    reload,
  } = useDashboardLive(fetchDashboard, { intervalMs: 15_000 });

  const errorMsg = dashboardErrorMessage(error, t);

  const filteredActivity = useMemo(() => {
    const rows = data?.activity || [];
    if (activityFilter === 'all') return rows;
    return rows.filter((row) => row.sourceType === activityFilter);
  }, [data?.activity, activityFilter]);

  const activityTypes = useMemo(() => {
    const set = new Set((data?.activity || []).map((r) => r.sourceType).filter(Boolean));
    return ['all', ...set];
  }, [data?.activity]);

  const canConfirmRates = useMemo(() => {
    const level = (key) => user?.permissions?.[key] || 'none';
    return level('accounts') !== 'none'
      || level('receipts') === 'edit'
      || level('payments') === 'edit'
      || level('journal') === 'edit';
  }, [user?.permissions]);

  if (loading && !data) {
    return <div className="dc-admin-dashboard">{t('ledger_loading')}</div>;
  }

  if (errorMsg && !data) {
    return (
      <div className="dc-admin-dashboard">
        <div className="dc-error">{errorMsg}</div>
        <button type="button" onClick={() => reload()}>{t('admin_refresh')}</button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const baseSymbol = data?.baseCurrency?.symbol || '₪';
  const busy = refreshing || loading;
  const cashBoxes = data?.cashBoxes || [];
  const topDebts = data?.topPatientDebts || [];
  const topPayables = data?.topSupplierPayables || [];
  const dayAppts = data?.appointments?.all || [];
  const onlineUsers = data?.activeUsers || [];

  return (
    <div className={`dc-admin-dashboard is-live-board${busy ? ' is-refreshing' : ''}`}>
      <header className="dc-admin-head">
        <div>
          <div className="dc-admin-title-row">
            <h2>{t('admin_dashboard_title')}</h2>
            <span
              key={flashKey}
              className="dc-live-badge is-flash"
              title={data?.generatedAt ? dateTime(data.generatedAt) : ''}
            >
              <span className="dc-live-dot" aria-hidden />
              {t('dashboard_live_label')}
            </span>
          </div>
          <p className="dc-muted text-sm dc-live-updated">
            {t('admin_last_updated', {
              time: relativeUpdated(data?.generatedAt, now, t),
            })}
          </p>
        </div>
        <button type="button" className="dc-admin-refresh" onClick={() => reload()} disabled={busy}>
          <i className={`fa-solid fa-rotate${busy ? ' fa-spin' : ''}`} />
          {t('admin_refresh')}
        </button>
      </header>

      {errorMsg && <div className="dc-error">{errorMsg}</div>}

      <div className="dc-admin-kpi-grid dc-live-stagger">
        <button type="button" className="dc-admin-kpi is-cash dc-live-card is-clickable" onClick={() => setKpiModal('cash')}>
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-cash-register" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_cash')}</span>
            <LiveKpiValue value={summary.cashTotalBase} format={money} />
            <span className="dc-admin-kpi-hint">{t('admin_kpi_click_hint')}</span>
          </div>
        </button>
        <button type="button" className="dc-admin-kpi is-receivable dc-live-card is-clickable" onClick={() => setKpiModal('receivables')}>
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-hand-holding-dollar" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_receivables')}</span>
            <LiveKpiValue value={summary.patientReceivables} format={money} />
            <span className="dc-admin-kpi-sub">
              {t('admin_kpi_debtors', { count: summary.patientsWithDebt || 0 })}
            </span>
            <span className="dc-admin-kpi-hint">{t('admin_kpi_click_hint')}</span>
          </div>
        </button>
        <button type="button" className="dc-admin-kpi is-payable dc-live-card is-clickable" onClick={() => setKpiModal('payables')}>
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-file-invoice-dollar" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_payables')}</span>
            <LiveKpiValue value={summary.supplierPayables} format={money} />
            <span className="dc-admin-kpi-hint">{t('admin_kpi_click_hint')}</span>
          </div>
        </button>
        <button type="button" className="dc-admin-kpi is-appt dc-live-card is-clickable" onClick={() => setKpiModal('appointments')}>
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-calendar-check" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_appointments')}</span>
            <LiveKpiValue value={summary.appointmentsToday ?? 0} />
            <span className="dc-admin-kpi-sub">
              {t('admin_kpi_active_now', { count: summary.activeNow || 0 })}
            </span>
            <span className="dc-admin-kpi-hint">{t('admin_kpi_click_hint')}</span>
          </div>
        </button>
        <button type="button" className="dc-admin-kpi is-users dc-live-card is-clickable" onClick={() => setKpiModal('users')}>
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-users" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_online_users')}</span>
            <LiveKpiValue value={summary.onlineUsers ?? 0} />
            <span className="dc-admin-kpi-hint">{t('admin_kpi_click_hint')}</span>
          </div>
        </button>
      </div>

      <CurrencyRatesSummary
        currencies={data?.currencies}
        baseCurrency={data?.baseCurrency}
        confirmedAt={data?.currencyRatesConfirmedAt}
        canConfirm={canConfirmRates}
        onConfirmClick={() => setShowCurrencyConfirm(true)}
      />

      <div className="dc-admin-main-grid">
        <section className="dc-admin-panel dc-live-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-door-open" /> {t('admin_live_rooms_title')}</h3>
            <span className="dc-badge dc-badge-emerald dc-live-count-badge">
              <span className="dc-live-dot is-sm" aria-hidden />
              {t('admin_live_now_count', { count: data?.appointments?.activeNow?.length || 0 })}
            </span>
          </div>

          {(data?.appointments?.activeNow?.length || 0) === 0 ? (
            <div className="dc-admin-empty">{t('admin_live_rooms_empty')}</div>
          ) : (
            <div className="dc-admin-room-grid">
              {data.appointments.activeNow.map((appt) => (
                <article key={appt.id} className="dc-admin-room-card is-live dc-live-pulse-card">
                  <div className="dc-admin-room-name">
                    <span className="dc-live-dot is-sm" aria-hidden />
                    {appt.roomName}
                  </div>
                  <div className="dc-admin-room-doctor">
                    <i className="fa-solid fa-user-doctor" />
                    {appt.doctorName}
                  </div>
                  <div className="dc-admin-room-patient">
                    <i className="fa-solid fa-user" />
                    {appt.patientName}
                  </div>
                  <div className="dc-admin-room-time">
                    {formatTime(appt.slot)} – {formatTime(appt.endSlot)}
                  </div>
                </article>
              ))}
            </div>
          )}

          <h4 className="dc-admin-subtitle">{t('admin_upcoming_title')}</h4>
          {(data?.appointments?.upcoming?.length || 0) === 0 ? (
            <div className="dc-admin-empty is-compact">{t('admin_upcoming_empty')}</div>
          ) : (
            <div className="dc-admin-upcoming-list">
              {data.appointments.upcoming.map((appt) => (
                <div key={appt.id} className="dc-admin-upcoming-row dc-live-row">
                  <span className="dc-admin-upcoming-time">
                    {formatTime(appt.slot)}
                  </span>
                  <span className="dc-admin-upcoming-room">{appt.roomName}</span>
                  <span className="dc-admin-upcoming-doctor">{appt.doctorName}</span>
                  <span className="dc-admin-upcoming-patient">{appt.patientName}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="dc-admin-panel dc-live-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-clock-rotate-left" /> {t('admin_activity_title')}</h3>
          </div>
          <div className="dc-admin-activity-filters">
            {activityTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={`dc-chip${activityFilter === type ? ' is-active' : ''}`}
                onClick={() => setActivityFilter(type)}
              >
                {type === 'all' ? t('admin_activity_all') : t(SOURCE_LABEL_KEYS[type] || type)}
              </button>
            ))}
          </div>
          <div className="dc-admin-activity-list">
            {filteredActivity.length === 0 && (
              <div className="dc-admin-empty is-compact">{t('admin_activity_empty')}</div>
            )}
            {filteredActivity.map((row) => (
              <article key={row.id} className="dc-admin-activity-row dc-live-row">
                <div className="dc-admin-activity-main">
                  <span className="dc-admin-activity-type">
                    {t(SOURCE_LABEL_KEYS[row.sourceType] || row.sourceType || '—')}
                  </span>
                  {row.entryNumber && (
                    <span className="dc-admin-activity-num">#{row.entryNumber}</span>
                  )}
                  <span className="dc-admin-activity-amount">{money(row.totalDebit)}</span>
                </div>
                <div className="dc-admin-activity-meta">
                  <span>{row.partyNames || row.memo || '—'}</span>
                  <span className="dc-admin-activity-user">
                    <i className="fa-solid fa-user-pen" />
                    {row.createdByName || row.createdByUsername || t('admin_user_unknown')}
                  </span>
                  <span className="dc-muted">
                    {dateTime(row.createdAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="dc-admin-main-grid">
        <section className="dc-admin-panel dc-live-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-circle-dot" /> {t('admin_online_users_title')}</h3>
            <span className="dc-badge dc-badge-emerald dc-live-count-badge">
              <span className="dc-live-dot is-sm" aria-hidden />
              {t('admin_live_now_count', { count: onlineUsers.length })}
            </span>
          </div>
          {onlineUsers.length === 0 ? (
            <div className="dc-admin-empty">{t('admin_online_users_empty')}</div>
          ) : (
            <div className="dc-admin-online-list">
              {onlineUsers.map((u) => (
                <article key={u.sessionId} className="dc-admin-online-row dc-live-row is-online">
                  <div className="dc-admin-online-main">
                    <span className="dc-live-dot is-sm" aria-hidden />
                    <strong>{u.userName}</strong>
                    <span className="dc-muted">@{u.username}</span>
                  </div>
                  <div className="dc-admin-online-meta">
                    <span>{roleLabel(u.role, t)}</span>
                    <span className="dc-muted">{dateTime(u.lastSeenAt)}</span>
                    {u.ipAddress && <span className="dc-muted">{u.ipAddress}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dc-admin-panel dc-live-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-right-to-bracket" /> {t('admin_auth_activity_title')}</h3>
          </div>
          <div className="dc-admin-activity-list">
            {(data?.authEvents?.length || 0) === 0 && (
              <div className="dc-admin-empty is-compact">{t('admin_auth_empty')}</div>
            )}
            {(data?.authEvents || []).map((row) => (
              <article
                key={row.id}
                className={`dc-admin-activity-row dc-auth-event dc-live-row is-${String(row.eventType || '').toLowerCase()}`}
              >
                <div className="dc-admin-activity-main">
                  <span className="dc-admin-activity-type">
                    {t(AUTH_EVENT_KEYS[row.eventType] || row.eventType || '—')}
                  </span>
                  <span>{row.userName || row.username || '—'}</span>
                </div>
                <div className="dc-admin-activity-meta">
                  {row.role && <span>{roleLabel(row.role, t)}</span>}
                  {row.ipAddress && <span>{row.ipAddress}</span>}
                  <span className="dc-muted">{dateTime(row.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="dc-admin-panel dc-admin-cash-panel dc-live-panel">
        <div className="dc-admin-panel-head">
          <h3><i className="fa-solid fa-vault" /> {t('admin_cash_boxes_title')}</h3>
        </div>
        <div className="dc-admin-cash-grid">
          {cashBoxes.length === 0 && (
            <div className="dc-admin-empty is-compact">{t('admin_cash_boxes_empty')}</div>
          )}
          {cashBoxes.map((box) => (
            <article key={box.id} className={`dc-admin-cash-card dc-live-card${box.boxKind !== 'CASH' ? ' is-checks' : ''}`}>
              <div className="dc-admin-cash-name">{box.name}</div>
              <div className="dc-admin-cash-balance">
                <LiveKpiValue
                  value={box.balance}
                  format={(n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${box.currencySymbol}`}
                />
              </div>
              {data?.baseCurrency?.code && box.currencyCode && box.currencyCode !== data.baseCurrency.code && (
                <div className="dc-muted text-sm">
                  ≈ {Number(box.balanceBase).toLocaleString(undefined, { maximumFractionDigits: 2 })} {baseSymbol}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <PartyModal
        open={Boolean(kpiModal)}
        title={kpiModal ? t(KPI_MODAL_TITLES[kpiModal]) : ''}
        onClose={() => setKpiModal(null)}
        wide
        className="dc-admin-kpi-modal"
      >
        {kpiModal === 'cash' && (
          <div className="dc-admin-kpi-drill">
            <p className="dc-muted text-sm dc-admin-kpi-drill-sum">
              {t('admin_kpi_drill_cash_total', { amount: money(summary.cashTotalBase) })}
            </p>
            {cashBoxes.length === 0 ? (
              <div className="dc-admin-empty">{t('admin_cash_boxes_empty')}</div>
            ) : (
              <div className="dc-admin-kpi-drill-grid">
                {cashBoxes.map((box) => (
                  <article
                    key={box.id}
                    className={`dc-admin-kpi-drill-card${box.boxKind !== 'CASH' ? ' is-checks' : ''}`}
                  >
                    <div className="dc-admin-kpi-drill-card-top">
                      <strong>{box.name}</strong>
                      <span className="dc-badge">
                        {box.boxKind === 'CASH' ? t('admin_kpi_drill_box_cash') : t('admin_kpi_drill_box_checks')}
                      </span>
                    </div>
                    <div className="dc-admin-kpi-drill-amount">
                      {Number(box.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {' '}
                      {box.currencySymbol}
                    </div>
                    {data?.baseCurrency?.code && box.currencyCode && box.currencyCode !== data.baseCurrency.code && (
                      <div className="dc-muted text-sm">
                        ≈ {Number(box.balanceBase).toLocaleString(undefined, { maximumFractionDigits: 2 })} {baseSymbol}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {kpiModal === 'receivables' && (
          <div className="dc-admin-kpi-drill">
            <p className="dc-muted text-sm">{t('admin_kpi_drill_top5_patients')}</p>
            {topDebts.length === 0 ? (
              <div className="dc-admin-empty">{t('admin_kpi_drill_debts_empty')}</div>
            ) : (
              <ol className="dc-admin-kpi-rank-list">
                {topDebts.map((row, idx) => (
                  <li key={row.id} className="dc-admin-kpi-rank-row">
                    <span className="dc-admin-kpi-rank-num">{idx + 1}</span>
                    <div className="dc-admin-kpi-rank-main">
                      <strong>{row.name}</strong>
                      {row.phone && <span className="dc-muted text-sm">{row.phone}</span>}
                    </div>
                    <span className="dc-admin-kpi-rank-amount">{money(row.balance)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {kpiModal === 'payables' && (
          <div className="dc-admin-kpi-drill">
            <p className="dc-muted text-sm">{t('admin_kpi_drill_top5_suppliers')}</p>
            {topPayables.length === 0 ? (
              <div className="dc-admin-empty">{t('admin_kpi_drill_payables_empty')}</div>
            ) : (
              <ol className="dc-admin-kpi-rank-list">
                {topPayables.map((row, idx) => (
                  <li key={row.id} className="dc-admin-kpi-rank-row">
                    <span className="dc-admin-kpi-rank-num">{idx + 1}</span>
                    <div className="dc-admin-kpi-rank-main">
                      <strong>{row.name}</strong>
                      {row.phone && <span className="dc-muted text-sm">{row.phone}</span>}
                    </div>
                    <span className="dc-admin-kpi-rank-amount">{money(row.balance)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {kpiModal === 'appointments' && (
          <div className="dc-admin-kpi-drill">
            {dayAppts.length === 0 ? (
              <div className="dc-admin-empty">{t('admin_kpi_drill_appts_empty')}</div>
            ) : (
              <div className="dc-admin-kpi-appt-list">
                {dayAppts.map((appt) => (
                  <article
                    key={appt.id}
                    className={`dc-admin-kpi-appt-row is-${appt.phase}`}
                  >
                    <div className="dc-admin-kpi-appt-time">
                      {formatTime(appt.slot)} – {formatTime(appt.endSlot)}
                    </div>
                    <div className="dc-admin-kpi-appt-main">
                      <strong>{appt.patientName}</strong>
                      <span className="dc-muted text-sm">
                        {appt.doctorName}
                        {' · '}
                        {appt.roomName}
                      </span>
                    </div>
                    <span className={`dc-badge${appt.phase === 'now' ? ' dc-badge-emerald' : ''}`}>
                      {apptPhaseLabel(appt.phase, t)}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {kpiModal === 'users' && (
          <div className="dc-admin-kpi-drill">
            {onlineUsers.length === 0 ? (
              <div className="dc-admin-empty">{t('admin_online_users_empty')}</div>
            ) : (
              <div className="dc-admin-online-list">
                {onlineUsers.map((u) => (
                  <article key={u.sessionId} className="dc-admin-online-row is-online">
                    <div className="dc-admin-online-main">
                      <span className="dc-live-dot is-sm" aria-hidden />
                      <strong>{u.userName}</strong>
                      <span className="dc-muted">@{u.username}</span>
                    </div>
                    <div className="dc-admin-online-meta">
                      <span>{roleLabel(u.role, t)}</span>
                      <span className="dc-muted">{dateTime(u.lastSeenAt)}</span>
                      {u.ipAddress && <span className="dc-muted">{u.ipAddress}</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </PartyModal>

      {showCurrencyConfirm && (
        <CurrencyDailyConfirm
          user={user}
          onConfirmed={() => {
            setShowCurrencyConfirm(false);
            reload();
          }}
          onClose={() => setShowCurrencyConfirm(false)}
        />
      )}
    </div>
  );
}
