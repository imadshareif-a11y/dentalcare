import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { useSettings } from '../context/SettingsContext';

function roomLabel(row, lang) {
  if (lang === 'en' && row.room_name_en) return row.room_name_en;
  if (lang === 'he' && row.room_name_he) return row.room_name_he;
  return row.room_name || '—';
}

export default function DoctorTodayBriefModal({ user, onClose }) {
  const { t, i18n } = useTranslation();
  const { date, timeRange } = useSettings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [brief, setBrief] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get('/appointments/my-today');
        if (!cancelled) setBrief(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? (err.body?.error || err.message) : t('error_network'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

  const appointments = brief?.appointments || [];
  const dayLabel = brief?.date ? date(brief.date) : date(new Date());

  return (
    <div className="dc-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="dc-modal dc-doctor-brief-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doctor-brief-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="doctor-brief-title">{t('doctor_brief_title')}</h3>
        <p className="dc-muted text-sm">
          {t('doctor_brief_greeting', { name: user?.name || '' })}
          {' · '}
          {dayLabel}
        </p>
        {user?.doctorName && (
          <p className="text-sm" style={{ marginTop: 4 }}>
            {t('doctor_brief_linked_as', { doctor: user.doctorName })}
          </p>
        )}

        {loading && <div style={{ marginTop: 12 }}>{t('ledger_loading')}</div>}
        {error && <div className="dc-error" style={{ marginTop: 12 }}>{error}</div>}

        {!loading && !error && appointments.length === 0 && (
          <p className="dc-muted" style={{ marginTop: 16 }}>{t('doctor_brief_empty')}</p>
        )}

        {!loading && !error && appointments.length > 0 && (
          <ul className="dc-doctor-brief-list">
            {appointments.map((row) => (
              <li key={row.id} className="dc-doctor-brief-item">
                <span className="dc-doctor-brief-time">
                  {timeRange(row.slot, row.end_slot)}
                </span>
                <span className="dc-doctor-brief-patient">{row.patient_name}</span>
                <span className="dc-muted text-sm">{roomLabel(row, i18n.language)}</span>
                {row.notes && (
                  <span className="dc-muted text-sm dc-doctor-brief-notes">{row.notes}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="dc-success" onClick={onClose}>
            {t('doctor_brief_close')}
          </button>
        </div>
      </div>
    </div>
  );
}
