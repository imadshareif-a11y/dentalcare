import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';
import LiveKpiValue from '../components/LiveKpiValue';
import {
  dashboardErrorMessage,
  relativeUpdated,
  useDashboardLive,
} from '../hooks/useDashboardLive';

const STATUS_KEYS = {
  SCHEDULED: 'doctor_appt_scheduled',
  DONE: 'doctor_appt_done',
  CANCELLED: 'doctor_appt_cancelled',
};

function formatSlot(slot) {
  return String(slot || '').slice(0, 5) || '—';
}

export default function DoctorDashboard({ user, onOpenPatient }) {
  const { t } = useTranslation();
  const { date, dateTime, timeRange, money } = useSettings();

  const fetchDashboard = useCallback(async () => {
    try {
      return await api.get('/doctor/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        return { __notLinked: true };
      }
      throw err;
    }
  }, []);

  const {
    data,
    loading,
    refreshing,
    error,
    now,
    reload,
  } = useDashboardLive(fetchDashboard, { intervalMs: 12_000 });

  const errorMsg = dashboardErrorMessage(error, t);
  const notLinked = Boolean(data?.__notLinked);
  const busy = refreshing || loading;

  if (loading && !data) {
    return <div className="dc-admin-dashboard">{t('ledger_loading')}</div>;
  }

  if (notLinked) {
    return (
      <div className="dc-admin-dashboard">
        <header className="dc-admin-head">
          <div>
            <h2>{t('doctor_dashboard_title')}</h2>
            <p className="dc-muted text-sm">{t('doctor_dashboard_greeting', { name: user?.name || '' })}</p>
          </div>
        </header>
        <div className="dc-admin-panel">
          <div className="dc-admin-empty">{t('doctor_dashboard_not_linked')}</div>
        </div>
      </div>
    );
  }

  if (errorMsg && !data) {
    return (
      <div className="dc-admin-dashboard">
        <div className="dc-error">{errorMsg}</div>
        <button type="button" onClick={() => reload()}>{t('doctor_dashboard_refresh')}</button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const activeNow = data?.appointments?.activeNow || [];
  const upcoming = data?.appointments?.upcoming || [];
  const all = data?.appointments?.all || [];
  const completed = data?.appointments?.completed || [];
  const sessions = data?.recentSessions || [];

  function openPatient(patientId) {
    if (patientId && onOpenPatient) onOpenPatient(patientId);
  }

  return (
    <div className={`dc-admin-dashboard dc-doctor-dashboard is-live-board${busy ? ' is-refreshing' : ''}`}>
      <header className="dc-admin-head">
        <div>
          <div className="dc-admin-title-row">
            <h2>{t('doctor_dashboard_title')}</h2>
            <span
              key={flashKey}
              className="dc-live-badge is-flash"
              title={data?.generatedAt ? dateTime(data.generatedAt) : ''}
            >
              <span className="dc-live-dot" aria-hidden />
              {t('dashboard_live_label')}
            </span>
          </div>
          <p className="dc-muted text-sm">
            {t('doctor_dashboard_greeting', { name: user?.name || '' })}
            {data?.doctor?.name && (
              <>
                {' · '}
                {t('doctor_brief_linked_as', { doctor: data.doctor.name })}
              </>
            )}
          </p>
          <p className="dc-muted text-sm dc-live-updated">
            {t('doctor_dashboard_day', { day: data?.today ? date(data.today) : '—' })}
            {' · '}
            {t('admin_last_updated', {
              time: relativeUpdated(data?.generatedAt, now, t),
            })}
          </p>
        </div>
        <button type="button" className="dc-admin-refresh" onClick={() => reload()} disabled={busy}>
          <i className={`fa-solid fa-rotate${busy ? ' fa-spin' : ''}`} />
          {t('doctor_dashboard_refresh')}
        </button>
      </header>

      {errorMsg && <div className="dc-error">{errorMsg}</div>}

      <div className="dc-admin-kpi-grid dc-live-stagger">
        <article className="dc-admin-kpi is-appt dc-live-card">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-calendar-day" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_today')}</span>
            <LiveKpiValue value={summary.appointmentsToday ?? 0} />
          </div>
        </article>
        <article className="dc-admin-kpi is-users dc-live-card">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-user-clock" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_active_now')}</span>
            <LiveKpiValue value={summary.activeNow ?? 0} />
          </div>
        </article>
        <article className="dc-admin-kpi is-receivable dc-live-card">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-hourglass-half" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_upcoming')}</span>
            <LiveKpiValue value={summary.upcomingToday ?? 0} />
          </div>
        </article>
        <article className="dc-admin-kpi is-cash dc-live-card">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-circle-check" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_completed')}</span>
            <LiveKpiValue value={summary.completedToday ?? 0} />
          </div>
        </article>
        <article className="dc-admin-kpi is-payable dc-live-card">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-tooth" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_with_plan')}</span>
            <LiveKpiValue value={summary.patientsWithPlan ?? 0} />
          </div>
        </article>
      </div>

      <div className="dc-admin-main-grid">
        <section className="dc-admin-panel dc-live-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-stethoscope" /> {t('doctor_current_title')}</h3>
            <span className="dc-badge dc-badge-emerald dc-live-count-badge">
              <span className="dc-live-dot is-sm" aria-hidden />
              {t('admin_live_now_count', { count: activeNow.length })}
            </span>
          </div>

          {activeNow.length === 0 ? (
            <div className="dc-admin-empty">{t('doctor_current_empty')}</div>
          ) : (
            <div className="dc-admin-room-grid">
              {activeNow.map((appt) => (
                <article key={appt.id} className="dc-admin-room-card is-live dc-live-pulse-card dc-doctor-appt-card">
                  <div className="dc-admin-room-name">
                    <span className="dc-live-dot is-sm" aria-hidden />
                    {appt.roomName}
                  </div>
                  <button
                    type="button"
                    className="dc-doctor-patient-link"
                    onClick={() => openPatient(appt.patientId)}
                  >
                    <i className="fa-solid fa-user" />
                    {appt.patientName}
                  </button>
                  {appt.patientPhone && (
                    <div className="dc-muted text-sm">
                      <i className="fa-solid fa-phone" />
                      {' '}
                      {appt.patientPhone}
                    </div>
                  )}
                  <div className="dc-admin-room-time">
                    {timeRange(appt.slot, appt.endSlot)}
                  </div>
                  {appt.scheduledItem && (
                    <div className="dc-doctor-plan-chip">{appt.scheduledItem}</div>
                  )}
                  {appt.pendingPlan && (
                    <div className="dc-muted text-sm">{appt.pendingPlan}</div>
                  )}
                  {appt.notes && (
                    <div className="dc-doctor-notes">{appt.notes}</div>
                  )}
                  {onOpenPatient && (
                    <button type="button" className="dc-success dc-doctor-open-btn" onClick={() => openPatient(appt.patientId)}>
                      {t('doctor_open_clinical')}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}

          <h4 className="dc-admin-subtitle">{t('doctor_upcoming_title')}</h4>
          {upcoming.length === 0 ? (
            <div className="dc-admin-empty is-compact">{t('doctor_upcoming_empty')}</div>
          ) : (
            <div className="dc-admin-upcoming-list">
              {upcoming.map((appt) => (
                <button
                  key={appt.id}
                  type="button"
                  className="dc-admin-upcoming-row dc-doctor-upcoming-row dc-live-row"
                  onClick={() => openPatient(appt.patientId)}
                >
                  <span className="dc-admin-upcoming-time">{formatSlot(appt.slot)}</span>
                  <span className="dc-admin-upcoming-room">{appt.roomName}</span>
                  <span className="dc-admin-upcoming-patient">{appt.patientName}</span>
                  <span className="dc-muted text-sm">{appt.scheduledItem || appt.pendingPlan || '—'}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="dc-admin-panel dc-live-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-list-check" /> {t('doctor_schedule_title')}</h3>
          </div>
          {all.length === 0 ? (
            <div className="dc-admin-empty">{t('doctor_schedule_empty')}</div>
          ) : (
            <div className="dc-doctor-schedule-list">
              {all.map((appt) => (
                <article
                  key={appt.id}
                  className={`dc-doctor-schedule-row dc-live-row is-${appt.phase}${appt.status === 'DONE' ? ' is-done' : ''}`}
                >
                  <div className="dc-doctor-schedule-time">{timeRange(appt.slot, appt.endSlot)}</div>
                  <div className="dc-doctor-schedule-main">
                    <button
                      type="button"
                      className="dc-doctor-patient-link"
                      onClick={() => openPatient(appt.patientId)}
                    >
                      {appt.patientName}
                    </button>
                    <span className="dc-muted text-sm">{appt.roomName}</span>
                    {appt.patientPhone && (
                      <span className="dc-muted text-sm">{appt.patientPhone}</span>
                    )}
                  </div>
                  <div className="dc-doctor-schedule-meta">
                    <span className={`dc-badge${appt.status === 'DONE' ? ' dc-badge-emerald' : ''}`}>
                      {t(STATUS_KEYS[appt.status] || appt.status)}
                    </span>
                    {(appt.scheduledItem || appt.pendingPlan) && (
                      <span className="dc-doctor-plan-chip is-inline">
                        {appt.scheduledItem || appt.pendingPlan}
                      </span>
                    )}
                  </div>
                  {appt.notes && <div className="dc-doctor-notes is-row">{appt.notes}</div>}
                </article>
              ))}
            </div>
          )}

          {sessions.length > 0 && (
            <>
              <h4 className="dc-admin-subtitle">{t('doctor_sessions_title')}</h4>
              <div className="dc-admin-activity-list">
                {sessions.map((s) => (
                  <article key={s.id} className="dc-admin-activity-row dc-live-row">
                    <div className="dc-admin-activity-main">
                      <button
                        type="button"
                        className="dc-doctor-patient-link"
                        onClick={() => openPatient(s.patientId)}
                      >
                        {s.patientName}
                      </button>
                      <span className="dc-admin-activity-amount">{money(s.total)}</span>
                    </div>
                    <div className="dc-admin-activity-meta">
                      <span>{s.notes || '—'}</span>
                      <span className="dc-muted">{dateTime(s.createdAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}

          {completed.length > 0 && sessions.length === 0 && (
            <>
              <h4 className="dc-admin-subtitle">{t('doctor_completed_title')}</h4>
              <div className="dc-admin-upcoming-list">
                {completed.map((appt) => (
                  <div key={appt.id} className="dc-admin-upcoming-row dc-live-row">
                    <span className="dc-admin-upcoming-time">{formatSlot(appt.slot)}</span>
                    <span className="dc-admin-upcoming-patient">{appt.patientName}</span>
                    <span className="dc-muted text-sm">{appt.roomName}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
