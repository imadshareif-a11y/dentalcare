import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notLinked, setNotLinked] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotLinked(false);
    try {
      const row = await api.get('/doctor/dashboard');
      setData(row);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setNotLinked(true);
        setData(null);
      } else {
        setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  if (loading && !data && !notLinked) {
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

  if (error && !data) {
    return (
      <div className="dc-admin-dashboard">
        <div className="dc-error">{error}</div>
        <button type="button" onClick={load}>{t('doctor_dashboard_refresh')}</button>
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
    <div className="dc-admin-dashboard dc-doctor-dashboard">
      <header className="dc-admin-head">
        <div>
          <h2>{t('doctor_dashboard_title')}</h2>
          <p className="dc-muted text-sm">
            {t('doctor_dashboard_greeting', { name: user?.name || '' })}
            {data?.doctor?.name && (
              <>
                {' · '}
                {t('doctor_brief_linked_as', { doctor: data.doctor.name })}
              </>
            )}
          </p>
          <p className="dc-muted text-sm">
            {t('doctor_dashboard_day', { day: data?.today ? date(data.today) : '—' })}
            {' · '}
            {t('admin_last_updated', {
              time: data?.generatedAt ? dateTime(data.generatedAt) : '—',
            })}
          </p>
        </div>
        <button type="button" className="dc-admin-refresh" onClick={load} disabled={loading}>
          <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} />
          {t('doctor_dashboard_refresh')}
        </button>
      </header>

      {error && <div className="dc-error">{error}</div>}

      <div className="dc-admin-kpi-grid">
        <article className="dc-admin-kpi is-appt">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-calendar-day" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_today')}</span>
            <strong>{summary.appointmentsToday ?? 0}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-users">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-user-clock" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_active_now')}</span>
            <strong>{summary.activeNow ?? 0}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-receivable">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-hourglass-half" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_upcoming')}</span>
            <strong>{summary.upcomingToday ?? 0}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-cash">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-circle-check" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_completed')}</span>
            <strong>{summary.completedToday ?? 0}</strong>
          </div>
        </article>
        <article className="dc-admin-kpi is-payable">
          <span className="dc-admin-kpi-icon"><i className="fa-solid fa-tooth" /></span>
          <div>
            <span className="dc-admin-kpi-label">{t('doctor_kpi_with_plan')}</span>
            <strong>{summary.patientsWithPlan ?? 0}</strong>
          </div>
        </article>
      </div>

      <div className="dc-admin-main-grid">
        <section className="dc-admin-panel">
          <div className="dc-admin-panel-head">
            <h3><i className="fa-solid fa-stethoscope" /> {t('doctor_current_title')}</h3>
            <span className="dc-badge dc-badge-emerald">
              {t('admin_live_now_count', { count: activeNow.length })}
            </span>
          </div>

          {activeNow.length === 0 ? (
            <div className="dc-admin-empty">{t('doctor_current_empty')}</div>
          ) : (
            <div className="dc-admin-room-grid">
              {activeNow.map((appt) => (
                <article key={appt.id} className="dc-admin-room-card is-live dc-doctor-appt-card">
                  <div className="dc-admin-room-name">{appt.roomName}</div>
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
                  className="dc-admin-upcoming-row dc-doctor-upcoming-row"
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

        <section className="dc-admin-panel">
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
                  className={`dc-doctor-schedule-row is-${appt.phase}${appt.status === 'DONE' ? ' is-done' : ''}`}
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
                  <article key={s.id} className="dc-admin-activity-row">
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
                  <div key={appt.id} className="dc-admin-upcoming-row">
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
