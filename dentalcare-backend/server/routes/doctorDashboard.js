const express = require('express');
const router = express.Router();
const { requireAuth, requireClinicContext } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { ensureAppointmentsSchema } = require('../db/ensureAppointments');
const { ensureUserDoctorLinkSchema } = require('../db/ensureUserDoctorLink');

function slotToMinutes(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function nowLocalMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function classifyAppointment(row, nowMin) {
  const start = slotToMinutes(row.slot);
  const end = slotToMinutes(row.end_slot || row.slot);
  if (start == null || end == null) return 'unknown';
  if (nowMin >= start && nowMin <= end) return 'now';
  if (nowMin < start) return 'upcoming';
  return 'past';
}

router.get('/doctor/dashboard', requireAuth, requireClinicContext, async (req, res) => {
  const today = String(req.query.date || todayIsoLocal()).slice(0, 10);
  const nowMin = today === todayIsoLocal() ? nowLocalMinutes() : null;

  try {
    await ensureAppointmentsSchema();
    await ensureUserDoctorLinkSchema();

    const data = await withTenantClient(req.user.tenantId, async (client) => {
      const userRow = await client.query(
        `SELECT u.doctor_party_id, dp.name AS doctor_name
         FROM users u
         LEFT JOIN parties dp ON dp.id = u.doctor_party_id AND dp.tenant_id = u.tenant_id
         WHERE u.id = $1 AND u.tenant_id = $2`,
        [req.user.userId, req.user.tenantId]
      );
      const doctorId = userRow.rows[0]?.doctor_party_id;
      const doctorName = userRow.rows[0]?.doctor_name || null;

      if (!doctorId) {
        return { linked: false, today, doctor: null };
      }

      const hasPlan = await client.query(
        `SELECT to_regclass('public.treatment_plan_items') AS t`
      );
      const withPlan = Boolean(hasPlan.rows[0]?.t);

      const apptSql = withPlan
        ? `SELECT a.id, a.patient_id, a.room_id, a.status,
                  a.appointment_date::text AS appointment_date,
                  a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                  a.notes, a.plan_item_id,
                  p.name AS patient_name, p.phone AS patient_phone,
                  r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he,
                  tpi.tooth_fdi AS plan_tooth, tpi.name AS plan_item_name,
                  pending.pending_plan
           FROM appointments a
           JOIN parties p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
           LEFT JOIN rooms r ON r.id = a.room_id AND r.tenant_id = a.tenant_id
           LEFT JOIN treatment_plan_items tpi ON tpi.id = a.plan_item_id
           LEFT JOIN LATERAL (
             SELECT string_agg('#' || tpi2.tooth_fdi || ' ' || tpi2.name, ' · ' ORDER BY tpi2.sort_order) AS pending_plan
             FROM treatment_plan_items tpi2
             JOIN treatment_plans tp ON tp.id = tpi2.plan_id
             WHERE tp.tenant_id = a.tenant_id
               AND tp.patient_id = a.patient_id
               AND tp.status = 'ACTIVE'
               AND tpi2.status IN ('PLANNED', 'IN_PROGRESS')
           ) pending ON TRUE
           WHERE a.tenant_id = $1
             AND a.doctor_id = $2
             AND a.appointment_date = $3::date
             AND a.status <> 'CANCELLED'
           ORDER BY a.slot ASC NULLS LAST, p.name ASC`
        : `SELECT a.id, a.patient_id, a.room_id, a.status,
                  a.appointment_date::text AS appointment_date,
                  a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                  a.notes,
                  p.name AS patient_name, p.phone AS patient_phone,
                  r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he,
                  NULL::text AS plan_tooth, NULL::text AS plan_item_name, NULL::text AS pending_plan
           FROM appointments a
           JOIN parties p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
           LEFT JOIN rooms r ON r.id = a.room_id AND r.tenant_id = a.tenant_id
           WHERE a.tenant_id = $1
             AND a.doctor_id = $2
             AND a.appointment_date = $3::date
             AND a.status <> 'CANCELLED'
           ORDER BY a.slot ASC NULLS LAST, p.name ASC`;

      const apptResult = await client.query(apptSql, [req.user.tenantId, doctorId, today]);
      const locale = req.user.locale || 'ar';

      const appointments = apptResult.rows.map((row) => {
        const phase = nowMin == null
          ? (row.status === 'DONE' ? 'past' : 'unknown')
          : classifyAppointment(row, nowMin);
        const roomName = row[`room_name_${locale}`] || row.room_name || '—';
        const scheduledItem = row.plan_tooth && row.plan_item_name
          ? `#${row.plan_tooth} ${row.plan_item_name}`
          : (row.plan_item_name || null);
        return {
          id: row.id,
          patientId: row.patient_id,
          patientName: row.patient_name,
          patientPhone: row.patient_phone || null,
          roomId: row.room_id,
          roomName,
          slot: row.slot,
          endSlot: row.end_slot,
          status: row.status,
          notes: row.notes,
          scheduledItem,
          pendingPlan: row.pending_plan || null,
          phase,
        };
      });

      const scheduled = appointments.filter((a) => a.status === 'SCHEDULED');
      const activeNow = scheduled.filter((a) => a.phase === 'now');
      const upcoming = scheduled.filter((a) => a.phase === 'upcoming');
      const completed = appointments.filter((a) => a.status === 'DONE');
      const withPendingPlan = scheduled.filter((a) => a.pendingPlan);

      let recentSessions = [];
      const hasSessions = await client.query(
        `SELECT to_regclass('public.clinical_sessions') AS t`
      );
      if (hasSessions.rows[0]?.t) {
        const sessionsResult = await client.query(
          `SELECT s.id, s.patient_id, s.total, s.notes, s.created_at,
                  p.name AS patient_name
           FROM clinical_sessions s
           JOIN parties p ON p.id = s.patient_id AND p.tenant_id = s.tenant_id
           WHERE s.tenant_id = $1
             AND s.doctor_id = $2
             AND (s.created_at AT TIME ZONE 'UTC')::date = $3::date
           ORDER BY s.created_at DESC
           LIMIT 8`,
          [req.user.tenantId, doctorId, today]
        );
        recentSessions = sessionsResult.rows.map((row) => ({
          id: row.id,
          patientId: row.patient_id,
          patientName: row.patient_name,
          total: Number(row.total) || 0,
          notes: row.notes,
          createdAt: row.created_at,
        }));
      }

      return {
        linked: true,
        generatedAt: new Date().toISOString(),
        today,
        doctor: { id: doctorId, name: doctorName },
        summary: {
          appointmentsToday: scheduled.length,
          activeNow: activeNow.length,
          upcomingToday: upcoming.length,
          completedToday: completed.length,
          patientsWithPlan: withPendingPlan.length,
        },
        appointments: {
          activeNow,
          upcoming: upcoming.slice(0, 15),
          completed,
          all: appointments,
        },
        recentSessions,
      };
    });

    if (!data.linked) {
      return res.status(403).json({ error: 'حسابك غير مربوط بسجل طبيب. تواصل مع مدير العيادة.' });
    }

    res.json(data);
  } catch (err) {
    console.error('Doctor dashboard failed:', err);
    res.status(500).json({ error: 'تعذّر تحميل لوحة الطبيب' });
  }
});

module.exports = router;
