import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';

const ROLE_KEYS = {
  OWNER: 'user_role_owner',
  ACCOUNTANT: 'user_role_accountant',
  DOCTOR: 'user_role_doctor',
  RECEPTIONIST: 'user_role_receptionist',
  SUPER_ADMIN: 'user_role_super_admin',
};

const EVENT_KEYS = {
  LOGIN_SUCCESS: 'admin_auth_login',
  LOGOUT: 'admin_auth_logout',
  LOGIN_FAILED: 'admin_auth_login_failed',
};

function roleLabel(role, t) {
  const key = ROLE_KEYS[role];
  return key ? t(key) : (role || '—');
}

export default function PlatformMonitoring() {
  const { t } = useTranslation();
  const { dateTime } = useSettings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clinicFilter, setClinicFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const row = await api.get('/platform/monitoring');
      setData(row);
    } catch (err) {
      setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const clinics = useMemo(() => {
    const map = new Map();
    (data?.users || []).forEach((u) => {
      if (u.tenantId && u.clinicName) map.set(u.tenantId, u.clinicName);
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [data?.users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return (data?.users || []).filter((u) => {
      if (clinicFilter !== 'all' && u.tenantId !== clinicFilter) return false;
      if (!q) return true;
      return [u.name, u.username, u.clinicName, u.role].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [data?.users, clinicFilter, userSearch]);

  const filteredSessions = useMemo(() => {
    if (clinicFilter === 'all') return data?.activeSessions || [];
    return (data?.activeSessions || []).filter((s) => s.tenantId === clinicFilter);
  }, [data?.activeSessions, clinicFilter]);

  if (loading && !data) {
    return <div>{t('ledger_loading')}</div>;
  }

  const summary = data?.summary || {};

  return (
    <div className="dc-platform-monitor space-y-4">
      <header className="dc-admin-head">
        <div>
          <h3>{t('platform_monitor_title')}</h3>
          <p className="dc-muted text-sm">
            {t('admin_last_updated', {
              time: data?.generatedAt ? dateTime(data.generatedAt) : '—',
            })}
            {' · '}
            {t('platform_monitor_window', { minutes: data?.activeWindowMinutes || 5 })}
          </p>
        </div>
        <button type="button" className="dc-admin-refresh" onClick={load} disabled={loading}>
          <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} />
          {t('admin_refresh')}
        </button>
      </header>

      {error && <div className="dc-error">{error}</div>}

      <div className="dc-admin-kpi-grid">
        <article className="dc-admin-kpi is-users">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-users" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('platform_monitor_active_users')}</span>
            <strong>{summary.activeUsers ?? 0}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-appt">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-hospital" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('platform_monitor_active_clinics')}</span>
            <strong>{summary.activeClinics ?? 0}</strong>
            <span className="dc-admin-kpi-sub">
              {t('platform_monitor_total_clinics', { count: summary.totalClinics || 0 })}
            </span>
          </div>
        </article>
        <article className="dc-admin-kpi is-receivable">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-right-to-bracket" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('platform_monitor_logins_today')}</span>
            <strong>{summary.loginsToday ?? 0}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-payable">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-triangle-exclamation" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('platform_monitor_failed_24h')}</span>
            <strong>{summary.failedLogins24h ?? 0}</strong>
          </div>
        </article>
      </div>

      <div className="dc-platform-monitor-filters">
        <label className="dc-muted text-sm">{t('platform_monitor_filter_clinic')}</label>
        <select value={clinicFilter} onChange={(e) => setClinicFilter(e.target.value)}>
          <option value="all">{t('admin_activity_all')}</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder={t('platform_monitor_search_users')}
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
        />
      </div>

      <div className="dc-admin-main-grid">
        <section className="dc-admin-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-circle-dot" /> {t('platform_monitor_online_now')}</h3>
            <span className="dc-badge dc-badge-emerald">
              {t('admin_live_now_count', { count: filteredSessions.length })}
            </span>
          </div>
          {filteredSessions.length === 0 ? (
            <div className="dc-admin-empty">{t('platform_monitor_online_empty')}</div>
          ) : (
            <div className="dc-platform-session-list">
              {filteredSessions.map((s) => (
                <article key={s.sessionId} className="dc-platform-session-row">
                  <div className="dc-platform-session-main">
                    <strong>{s.userName}</strong>
                    <span className="dc-muted">@{s.username}</span>
                    {s.sessionKind === 'SUPPORT' && (
                      <span className="dc-badge dc-badge-amber">{t('platform_monitor_support')}</span>
                    )}
                  </div>
                  <div className="dc-platform-session-meta">
                    <span>{s.clinicName || '—'}</span>
                    <span>{roleLabel(s.role, t)}</span>
                    <span className="dc-muted">{dateTime(s.lastSeenAt)}</span>
                    {s.ipAddress && <span className="dc-muted">{s.ipAddress}</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dc-admin-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-clock-rotate-left" /> {t('platform_monitor_auth_feed')}</h3>
          </div>
          <div className="dc-admin-activity-list">
            {(data?.recentEvents || []).length === 0 && (
              <div className="dc-admin-empty is-compact">{t('admin_auth_empty')}</div>
            )}
            {(data?.recentEvents || []).map((row) => (
              <article
                key={row.id}
                className={`dc-admin-activity-row dc-auth-event is-${String(row.eventType || '').toLowerCase()}`}
              >
                <div className="dc-admin-activity-main">
                  <span className="dc-admin-activity-type">
                    {t(EVENT_KEYS[row.eventType] || row.eventType || '—')}
                  </span>
                  <span>{row.userName || row.username || '—'}</span>
                </div>
                <div className="dc-admin-activity-meta">
                  <span>{row.clinicName || '—'}</span>
                  {row.role && <span>{roleLabel(row.role, t)}</span>}
                  {row.ipAddress && <span>{row.ipAddress}</span>}
                  <span className="dc-muted">{dateTime(row.createdAt)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="dc-admin-panel">
        <div className="dc-admin-panel-head">
          <h3><i className="fa-solid fa-id-card" /> {t('platform_monitor_users_table')}</h3>
          <span className="dc-muted text-sm">{filteredUsers.length}</span>
        </div>
        <div className="dc-platform-users-table-wrap">
          <table className="w-full text-sm dc-platform-users-table">
            <thead>
              <tr>
                <th>{t('user_name')}</th>
                <th>{t('user_username')}</th>
                <th>{t('platform_clinic_name')}</th>
                <th>{t('user_role')}</th>
                <th>{t('platform_monitor_last_login')}</th>
                <th>{t('platform_monitor_status')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 && (
                <tr><td colSpan={6} className="dc-muted">{t('platform_monitor_users_empty')}</td></tr>
              )}
              {filteredUsers.map((u) => (
                <tr key={u.id} className={u.isOnline ? 'is-online' : ''}>
                  <td><strong>{u.name}</strong></td>
                  <td>{u.username}</td>
                  <td>{u.clinicName || '—'}</td>
                  <td>{roleLabel(u.role, t)}</td>
                  <td>{u.lastLoginAt ? dateTime(u.lastLoginAt) : '—'}</td>
                  <td>
                    {u.isOnline ? (
                      <span className="dc-badge dc-badge-emerald">{t('platform_monitor_online')}</span>
                    ) : u.isActive ? (
                      <span className="dc-badge">{t('platform_monitor_offline')}</span>
                    ) : (
                      <span className="dc-badge dc-badge-rose">{t('user_status_inactive')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
