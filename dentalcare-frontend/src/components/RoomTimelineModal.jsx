import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import FormattedDateInput from './FormattedDateInput';
import { localizedDisplay } from '../lib/localizedName';
import { useSettings } from '../context/SettingsContext';
import useEscapeClose from '../hooks/useEscapeClose';

const ROOM_NAME_KEYS = {
  ar: ['name', 'room_name'],
  en: ['name_en', 'room_name_en'],
  he: ['name_he', 'room_name_he'],
};

function slotToMinutes(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return null;
  const [h, m] = raw.split(':').map(Number);
  return h * 60 + m;
}

function appointmentEndSlot(row) {
  return row.end_slot || row.slot || String(row.starts_at || '').slice(11, 16);
}

function slotsInRange(start, end, allSlots) {
  const a = slotToMinutes(start);
  const b = slotToMinutes(end ?? start);
  if (a == null || b == null) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return allSlots.filter((s) => {
    const m = slotToMinutes(s);
    return m != null && m >= lo && m <= hi;
  });
}

function blockStyle(start, end, slots) {
  const rangeSlots = slotsInRange(start, end, slots);
  const startIdx = slots.indexOf(rangeSlots[0]);
  if (startIdx < 0 || rangeSlots.length === 0) return null;
  const total = slots.length;
  return {
    left: `${(startIdx / total) * 100}%`,
    width: `${(rangeSlots.length / total) * 100}%`,
  };
}

function slotFromTrackClick(event, trackEl, slots) {
  if (!trackEl || slots.length === 0) return null;
  const rect = trackEl.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
  const idx = Math.min(slots.length - 1, Math.max(0, Math.floor(ratio * slots.length)));
  return slots[idx];
}

function roomBlocks(appointments, roomId, slots) {
  return (appointments || [])
    .filter((a) => a.room_id === roomId && a.status !== 'CANCELLED')
    .map((a) => {
      const end = appointmentEndSlot(a);
      const style = blockStyle(a.slot, end, slots);
      if (!style) return null;
      return {
        id: a.id,
        appt: a,
        status: a.status,
        start: a.slot,
        end,
        style,
      };
    })
    .filter(Boolean)
    .sort((x, y) => slotToMinutes(x.start) - slotToMinutes(y.start));
}

export default function RoomTimelineModal({
  open,
  onClose,
  date,
  onDateChange,
  minDate,
  rooms,
  appointments,
  slots,
  loading,
  canBook,
  onSelectAppointment,
  onBookSlot,
}) {
  const { t, i18n } = useTranslation();
  const { time, timeRange } = useSettings();
  const trackRefs = useRef({});
  useEscapeClose(open, onClose);

  const hourMarks = useMemo(() => {
    const marks = [];
    for (let h = 8; h <= 20; h += 1) {
      marks.push(`${String(h).padStart(2, '0')}:00`);
    }
    return marks;
  }, []);

  if (!open) return null;

  return (
    <div className="dc-modal-backdrop" onClick={onClose}>
      <div
        className="dc-modal dc-room-timeline-modal is-wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('clinical_room_timeline_title')}
      >
        <div className="dc-appt-head">
          <h3>{t('clinical_room_timeline_title')}</h3>
          <button type="button" className="dc-danger" onClick={onClose} aria-label={t('close')}>×</button>
        </div>
        <p className="dc-muted text-sm">{t('clinical_room_timeline_hint')}</p>

        <div className="dc-room-timeline-toolbar">
          <label className="dc-muted text-sm">{t('clinical_appointment_date')}</label>
          <FormattedDateInput value={date} onChange={onDateChange} min={minDate} />
        </div>

        <div className="dc-room-timeline-legend">
          <span className="dc-room-timeline-legend-item is-free">{t('clinical_slot_available')}</span>
          <span className="dc-room-timeline-legend-item is-scheduled">{t('clinical_appt_scheduled')}</span>
          <span className="dc-room-timeline-legend-item is-done">{t('clinical_appt_done')}</span>
        </div>

        {loading ? (
          <p className="dc-muted">{t('clinical_room_timeline_loading')}</p>
        ) : rooms.length === 0 ? (
          <p className="dc-muted">{t('clinical_schedule_no_rooms')}</p>
        ) : (
          <div className="dc-room-timeline-wrap">
            <div className="dc-room-timeline-axis">
              <div className="dc-room-timeline-axis-label" aria-hidden="true" />
              <div className="dc-room-timeline-axis-hours">
                {hourMarks.map((mark) => (
                  <span key={mark} className="dc-room-timeline-hour">{time(mark)}</span>
                ))}
              </div>
            </div>
            {rooms.map((room) => {
              const blocks = roomBlocks(appointments, room.id, slots);
              const roomName = localizedDisplay(room, i18n.language, ROOM_NAME_KEYS);
              return (
                <div key={room.id} className="dc-room-timeline-row">
                  <div className="dc-room-timeline-room" title={roomName}>{roomName}</div>
                  <div
                    className="dc-room-timeline-track"
                    ref={(el) => { trackRefs.current[room.id] = el; }}
                    onClick={(e) => {
                      if (!canBook || !onBookSlot) return;
                      if (e.target.closest('.dc-room-timeline-block')) return;
                      const slot = slotFromTrackClick(e, trackRefs.current[room.id], slots);
                      if (slot) onBookSlot({ roomId: room.id, slot });
                    }}
                    role="presentation"
                  >
                    <div className="dc-room-timeline-grid" aria-hidden="true">
                      {slots.map((slot) => (
                        <span key={slot} className="dc-room-timeline-grid-cell" />
                      ))}
                    </div>
                    {blocks.map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        className={[
                          'dc-room-timeline-block',
                          block.status === 'DONE' ? ' is-done' : ' is-scheduled',
                        ].join('')}
                        style={block.style}
                        title={t('clinical_room_timeline_block_title', {
                          patient: block.appt.patient_name,
                          doctor: block.appt.doctor_name || '—',
                          range: timeRange(block.start, block.end),
                        })}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAppointment?.(block.appt);
                        }}
                      >
                        <span className="dc-room-timeline-block-time">
                          {timeRange(block.start, block.end)}
                        </span>
                        <span className="dc-room-timeline-block-patient">{block.appt.patient_name}</span>
                        <span className="dc-room-timeline-block-doctor">{block.appt.doctor_name || '—'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
