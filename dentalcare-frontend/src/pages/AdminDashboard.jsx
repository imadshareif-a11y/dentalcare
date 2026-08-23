import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';

const SOURCE_LABEL_KEYS = {
  RECEIPT: 'nav_receipt',
  PAYMENT: 'nav_payment',
  JOURNAL: 'nav_voucher',
  BANK_ENTRY: 'nav_bank_entry',
  PURCHASE_INVOICE: 'nav_purchase_invoice',
  CREDIT_NOTE: 'nav_credit_note',
  DEBIT_NOTE: 'nav_debit_note',
  OPENING: 'admin_source_opening',
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

function roleLabel(role, t) {
  const key = ROLE_KEYS[role];
  return key ? t(key) : (role || '—');
}

function formatTime(slot) {
  return String(slot || '').slice(0, 5) || '—';
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { money, dateTime } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activityFilter, setActivityFilter] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    try {
      const row = await api.get('/admin/dashboard');
      setData(row);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filteredActivity = useMemo(() => {
    const rows = data?.activity || [];
    if (activityFilter === 'all') return rows;
    return rows.filter((row) => row.sourceType === activityFilter);
  }, [data?.activity, activityFilter]);

  const activityTypes = useMemo(() => {
    const set = new Set((data?.activity || []).map((r) => r.sourceType).filter(Boolean));
    return ['all', ...set];
  }, [data?.activity]);

  if (loading && !data) {
    return <div className="dc-admin-dashboard">{t('ledger_loading')}</div>;
  }

  if (error && !data) {
    return (
      <div className="dc-admin-dashboard">
        <div className="dc-error">{error}</div>
        <button type="button" onClick={load}>{t('admin_refresh')}</button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const baseSymbol = data?.baseCurrency?.symbol || '₪';

  return (
    <div className="dc-admin-dashboard">
      <header className="dc-admin-head">
        <div>
          <h2>{t('admin_dashboard_title')}</h2>
          <p className="dc-muted text-sm">
            {t('admin_last_updated', {
              time: data?.generatedAt ? dateTime(data.generatedAt) : '—',
            })}
          </p>
        </div>
        <button type="button" className="dc-admin-refresh" onClick={load} disabled={loading}>
          <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} />
          {t('admin_refresh')}
        </button>
      </header>

      {error && <div className="dc-error">{error}</div>}

      <div className="dc-admin-kpi-grid">
        <article className="dc-admin-kpi is-cash">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-cash-register" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_cash')}</span>
            <strong>{money(summary.cashTotalBase)}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-receivable">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-hand-holding-dollar" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_receivables')}</span>
            <strong>{money(summary.patientReceivables)}</strong>
            <span className="dc-admin-kpi-sub">
              {t('admin_kpi_debtors', { count: summary.patientsWithDebt || 0 })}
            </span>
          </div>
        </article>
        <article className="dc-admin-kpi is-payable">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-file-invoice-dollar" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_payables')}</span>
            <strong>{money(summary.supplierPayables)}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-appt">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-calendar-check" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_appointments')}</span>
            <strong>{summary.appointmentsToday ?? 0}</strong>
            <span className="dc-admin-kpi-sub">
              {t('admin_kpi_active_now', { count: summary.activeNow || 0 })}
            </span>
          </div>
        </article>
        <article className="dc-admin-kpi is-users">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-users" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('admin_kpi_online_users')}</span>
            <strong>{summary.onlineUsers ?? 0}</strong>
          </div>
        </article>
      </div>

      <div className="dc-admin-main-grid">
        <section className="dc-admin-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-door-open" /> {t('admin_live_rooms_title')}</h3>
            <span className="dc-badge dc-badge-emerald">
              {t('admin_live_now_count', { count: data?.appointments?.activeNow?.length || 0 })}
            </span>
          </div>

          {(data?.appointments?.activeNow?.length || 0) === 0 ? (
            <div className="dc-admin-empty">{t('admin_live_rooms_empty')}</div>
          ) : (
            <div className="dc-admin-room-grid">
              {data.appointments.activeNow.map((appt) => (
                <article key={appt.id} className="dc-admin-room-card is-live">
                  <div className="dc-admin-room-name">{appt.roomName}</div>
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
                <div key={appt.id} className="dc-admin-upcoming-row">
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

        <section className="dc-admin-panel">
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
              <article key={row.id} className="dc-admin-activity-row">
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
        <section className="dc-admin-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-circle-dot" /> {t('admin_online_users_title')}</h3>
            <span className="dc-badge dc-badge-emerald">
              {t('admin_live_now_count', { count: data?.activeUsers?.length || 0 })}
            </span>
          </div>
          {(data?.activeUsers?.length || 0) === 0 ? (
            <div className="dc-admin-empty">{t('admin_online_users_empty')}</div>
          ) : (
            <div className="dc-admin-online-list">
              {data.activeUsers.map((u) => (
                <article key={u.sessionId} className="dc-admin-online-row">
                  <div className="dc-admin-online-main">
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

        <section className="dc-admin-panel">
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
                className={`dc-admin-activity-row dc-auth-event is-${String(row.eventType || '').toLowerCase()}`}
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

      <section className="dc-admin-panel dc-admin-cash-panel">
        <div className="dc-admin-panel-head">
          <h3><i className="fa-solid fa-vault" /> {t('admin_cash_boxes_title')}</h3>
        </div>
        <div className="dc-admin-cash-grid">
          {(data?.cashBoxes || []).length === 0 && (
            <div className="dc-admin-empty is-compact">{t('admin_cash_boxes_empty')}</div>
          )}
          {(data?.cashBoxes || []).map((box) => (
            <article key={box.id} className={`dc-admin-cash-card${box.boxKind !== 'CASH' ? ' is-checks' : ''}`}>
              <div className="dc-admin-cash-name">{box.name}</div>
              <div className="dc-admin-cash-balance">
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
      </section>
    </div>
  );
}
