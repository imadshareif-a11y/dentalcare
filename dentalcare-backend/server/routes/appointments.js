const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission, requireClinicContext } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { tryAutoSend } = require('../whatsapp/service');
const { ensureAppointmentsSchema } = require('../db/ensureAppointments');
const { ensureUserDoctorLinkSchema } = require('../db/ensureUserDoctorLink');

const SLOT_RE = /^([01]\d|2[0-3]):(00|30)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSlot(value) {
  const raw = String(value || '').trim();
  if (SLOT_RE.test(raw)) return raw;
  return null;
}

function slotToMinutes(value) {
  const slot = normalizeSlot(value);
  if (!slot) return null;
  const [h, m] = slot.split(':').map(Number);
  return h * 60 + m;
}

function normalizeRange(slot, endSlot) {
  const start = normalizeSlot(slot);
  let end = normalizeSlot(endSlot || slot);
  if (!start || !end) return null;
  if (slotToMinutes(end) < slotToMinutes(start)) {
    return { slot: end, endSlot: start };
  }
  return { slot: start, endSlot: end };
}

function rangesOverlap(startA, endA, startB, endB) {
  const a0 = slotToMinutes(startA);
  const a1 = slotToMinutes(endA);
  const b0 = slotToMinutes(startB);
  const b1 = slotToMinutes(endB);
  if ([a0, a1, b0, b1].some((n) => n == null)) return false;
  return a0 <= b1 && b0 <= a1;
}

async function assertDoctor(client, tenantId, doctorId) {
  const result = await client.query(
    `SELECT id FROM parties WHERE id = $1 AND tenant_id = $2 AND party_type = 'DOCTOR'`,
    [doctorId, tenantId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('الطبيب غير موجود'), { statusCode: 400 });
  }
}

async function assertRoom(client, tenantId, roomId) {
  const result = await client.query(
    `SELECT id FROM rooms WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [roomId, tenantId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('الغرفة غير موجودة أو غير فعّالة'), { statusCode: 400 });
  }
}

async function assertNoOverlap(client, tenantId, { day, doctorId, roomId, slot, endSlot, excludeId = null }) {
  const existing = await client.query(
    `SELECT id, slot, end_slot, doctor_id, room_id
     FROM appointments
     WHERE tenant_id = $1 AND appointment_date = $2::date AND status <> 'CANCELLED'`,
    [tenantId, day]
  );
  for (const row of existing.rows) {
    if (excludeId && String(row.id) === String(excludeId)) continue;
    const exEnd = row.end_slot || row.slot;
    if (row.doctor_id === doctorId && rangesOverlap(slot, endSlot, row.slot, exEnd)) {
      throw Object.assign(new Error('يتعارض الموعد مع حجز آخر لنفس الطبيب'), { statusCode: 409 });
    }
    if (row.room_id === roomId && rangesOverlap(slot, endSlot, row.slot, exEnd)) {
      throw Object.assign(new Error('يتعارض الموعد مع حجز آخر في نفس الغرفة'), { statusCode: 409 });
    }
  }
}

router.get(
  '/appointments/my-today',
  requireAuth,
  requireClinicContext,
  async (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    try {
      await ensureAppointmentsSchema();
      await ensureUserDoctorLinkSchema();
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const userRow = await client.query(
          `SELECT doctor_party_id FROM users WHERE id = $1 AND tenant_id = $2`,
          [req.user.userId, req.user.tenantId]
        );
        const doctorId = userRow.rows[0]?.doctor_party_id;
        if (!doctorId) return { linked: false, date: day, appointments: [] };

        const result = await client.query(
          `SELECT a.id, a.patient_id, a.room_id, a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                  a.status, a.notes,
                  p.name AS patient_name,
                  r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he
           FROM appointments a
           JOIN parties p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
           LEFT JOIN rooms r ON r.id = a.room_id AND r.tenant_id = a.tenant_id
           WHERE a.tenant_id = $1
             AND a.doctor_id = $2
             AND a.appointment_date = $3::date
             AND a.status = 'SCHEDULED'
           ORDER BY a.slot ASC NULLS LAST, a.starts_at ASC NULLS LAST`,
          [req.user.tenantId, doctorId, day]
        );
        return { linked: true, date: day, doctorId, appointments: result.rows };
      });
      res.json(rows);
    } catch (err) {
      console.error('Fetching doctor today brief failed:', err);
      res.status(500).json({ error: 'تعذّر جلب مواعيد اليوم' });
    }
  }
);

router.get(
  '/appointments',
  requireAuth,
  requireAnyPermission([['appointments', 'view'], ['clinical', 'view']]),
  async (req, res) => {
    const day = req.query.date || new Date().toISOString().slice(0, 10);
    const doctorId = req.query.doctorId || null;
    const roomId = req.query.roomId || null;
    try {
      await ensureAppointmentsSchema();
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const params = [req.user.tenantId, day];
        let extraFilter = ' AND a.tenant_id = $1';
        if (doctorId) {
          params.push(doctorId);
          extraFilter += ` AND a.doctor_id = $${params.length}`;
        }
        if (roomId) {
          params.push(roomId);
          extraFilter += ` AND a.room_id = $${params.length}`;
        }

        const hasPlan = await client.query(
          `SELECT to_regclass('public.treatment_plan_items') AS t`
        );
        const withPlan = Boolean(hasPlan.rows[0]?.t);

        const sql = withPlan
          ? `SELECT a.id, a.patient_id, a.doctor_id, a.room_id, a.starts_at, a.notes, a.status,
                  a.appointment_date::text AS appointment_date, a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                  a.plan_item_id,
                  p.name AS patient_name, d.name AS doctor_name,
                  r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he,
                  tpi.tooth_fdi AS plan_tooth, tpi.name AS plan_item_name,
                  tpi.condition_code AS plan_condition_code,
                  pending.pending_plan
             FROM appointments a
             JOIN parties p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
             LEFT JOIN parties d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
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
             WHERE a.appointment_date = $2::date${extraFilter}
             ORDER BY a.slot ASC, d.name ASC NULLS LAST, r.name ASC NULLS LAST`
          : `SELECT a.id, a.patient_id, a.doctor_id, a.room_id, a.starts_at, a.notes, a.status,
                  a.appointment_date::text AS appointment_date, a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                  NULL::uuid AS plan_item_id,
                  p.name AS patient_name, d.name AS doctor_name,
                  r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he,
                  NULL::varchar AS plan_tooth, NULL::varchar AS plan_item_name,
                  NULL::varchar AS plan_condition_code,
                  NULL::text AS pending_plan
             FROM appointments a
             JOIN parties p ON p.id = a.patient_id AND p.tenant_id = a.tenant_id
             LEFT JOIN parties d ON d.id = a.doctor_id AND d.tenant_id = a.tenant_id
             LEFT JOIN rooms r ON r.id = a.room_id AND r.tenant_id = a.tenant_id
             WHERE a.appointment_date = $2::date${extraFilter}
             ORDER BY a.slot ASC, d.name ASC NULLS LAST, r.name ASC NULLS LAST`;

        const result = await client.query(sql, params);
        return result.rows;
      });
      res.json(rows);
    } catch (err) {
      console.error('Listing appointments failed:', err);
      res.status(500).json({ error: 'تعذّر جلب المواعيد' });
    }
  }
);

router.post(
  '/appointments',
  requireAuth,
  requireAnyPermission([['appointments', 'edit'], ['clinical', 'edit']]),
  async (req, res) => {
    const { patientId, doctorId, roomId, notes, planItemId } = req.body;
    const day = String(req.body.date || '').slice(0, 10);
    const range = normalizeRange(req.body.slot, req.body.endSlot || req.body.slot);
    if (!patientId || !doctorId || !roomId || !DATE_RE.test(day) || !range) {
      return res.status(400).json({
        error: 'المريض والطبيب والغرفة والتاريخ ووقت البداية مطلوبة',
      });
    }
    const { slot, endSlot } = range;
    try {
      await ensureAppointmentsSchema();
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        await assertDoctor(client, req.user.tenantId, doctorId);
        await assertRoom(client, req.user.tenantId, roomId);
        await assertNoOverlap(client, req.user.tenantId, { day, doctorId, roomId, slot, endSlot });

        let linkedPlanItemId = null;
        if (planItemId) {
          const hasPlan = await client.query(
            `SELECT to_regclass('public.treatment_plan_items') AS t`
          );
          if (!hasPlan.rows[0]?.t) {
            throw Object.assign(new Error('خطة العلاج غير متاحة بعد — أعد المحاولة بدون ربط بند'), {
              statusCode: 400,
            });
          }
          const planCheck = await client.query(
            `SELECT tpi.id
             FROM treatment_plan_items tpi
             JOIN treatment_plans tp ON tp.id = tpi.plan_id
             WHERE tpi.id = $1 AND tp.tenant_id = $2 AND tp.patient_id = $3 AND tpi.status IN ('PLANNED', 'IN_PROGRESS')`,
            [planItemId, req.user.tenantId, patientId]
          );
          if (planCheck.rowCount === 0) {
            throw Object.assign(new Error('بند خطة العلاج غير صالح'), { statusCode: 400 });
          }
          linkedPlanItemId = planItemId;
        }

        const result = await client.query(
          `INSERT INTO appointments (
             tenant_id, patient_id, doctor_id, room_id, starts_at, notes, appointment_date, slot, end_slot, plan_item_id
           )
           VALUES ($1, $2, $3, $4, ($5::date + $6::time), $7, $5::date, $8, $9, $10)
           RETURNING id, slot, COALESCE(end_slot, slot) AS end_slot`,
          [
            req.user.tenantId,
            patientId,
            doctorId,
            roomId,
            day,
            slot,
            notes || null,
            slot,
            endSlot,
            linkedPlanItemId,
          ]
        );
        return result.rows[0];
      });

      setImmediate(() => {
        tryAutoSend(req.user.tenantId, {
          kind: 'appointment',
          appointmentId: row.id,
        }).catch(() => {});
      });

      res.status(201).json({ success: true, id: row.id, slot: row.slot, end_slot: row.end_slot });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23505') {
        const msg = String(err.detail || '').includes('room_id')
          ? 'يتعارض الموعد مع حجز آخر في نفس الغرفة'
          : 'يتعارض الموعد مع حجز آخر لنفس الطبيب';
        return res.status(409).json({ error: msg });
      }
      console.error('Creating appointment failed:', err);
      res.status(500).json({ error: 'تعذّر حفظ الموعد' });
    }
  }
);

router.patch(
  '/appointments/:id',
  requireAuth,
  requireAnyPermission([['appointments', 'edit'], ['clinical', 'edit']]),
  async (req, res) => {
    const {
      status,
      patientId,
      doctorId,
      roomId,
      notes,
      planItemId,
    } = req.body;
    const hasStatus = Object.prototype.hasOwnProperty.call(req.body, 'status');
    const hasDate = Object.prototype.hasOwnProperty.call(req.body, 'date');
    const hasSlot = Object.prototype.hasOwnProperty.call(req.body, 'slot')
      || Object.prototype.hasOwnProperty.call(req.body, 'endSlot');
    const hasPatient = Object.prototype.hasOwnProperty.call(req.body, 'patientId');
    const hasDoctor = Object.prototype.hasOwnProperty.call(req.body, 'doctorId');
    const hasRoom = Object.prototype.hasOwnProperty.call(req.body, 'roomId');
    const hasNotes = Object.prototype.hasOwnProperty.call(req.body, 'notes');
    const hasPlanItem = Object.prototype.hasOwnProperty.call(req.body, 'planItemId');
    const wantsReschedule = hasDate || hasSlot || hasPatient || hasDoctor || hasRoom || hasNotes || hasPlanItem;

    if (!hasStatus && !wantsReschedule) {
      return res.status(400).json({ error: 'لا توجد بيانات لتحديث الموعد' });
    }
    if (hasStatus && !['SCHEDULED', 'DONE', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'حالة الموعد غير صالحة' });
    }

    try {
      await ensureAppointmentsSchema();
      await withTenantClient(req.user.tenantId, async (client) => {
        const current = await client.query(
          `SELECT id, patient_id, doctor_id, room_id, notes, status,
                  appointment_date::text AS appointment_date, slot,
                  COALESCE(end_slot, slot) AS end_slot, plan_item_id
           FROM appointments WHERE id = $1`,
          [req.params.id]
        );
        if (current.rowCount === 0) {
          throw Object.assign(new Error('الموعد غير موجود'), { statusCode: 404 });
        }
        const row = current.rows[0];

        if (wantsReschedule && row.status !== 'SCHEDULED' && !hasStatus) {
          throw Object.assign(new Error('يمكن تعديل المواعيد المجدولة فقط'), { statusCode: 400 });
        }

        const nextPatientId = hasPatient ? patientId : row.patient_id;
        const nextDoctorId = hasDoctor ? doctorId : row.doctor_id;
        const nextRoomId = hasRoom ? roomId : row.room_id;
        const nextDay = hasDate ? String(req.body.date || '').slice(0, 10) : row.appointment_date;
        const nextNotes = hasNotes ? (notes || null) : row.notes;
        let nextStatus = hasStatus ? status : row.status;

        let nextSlot = row.slot;
        let nextEndSlot = row.end_slot || row.slot;
        if (hasSlot || hasDate || hasDoctor || hasRoom) {
          const range = normalizeRange(
            hasSlot || hasDate ? (req.body.slot || row.slot) : row.slot,
            hasSlot || hasDate ? (req.body.endSlot || req.body.slot || row.end_slot || row.slot) : (row.end_slot || row.slot)
          );
          if (!range) {
            throw Object.assign(new Error('وقت الموعد غير صالح'), { statusCode: 400 });
          }
          nextSlot = range.slot;
          nextEndSlot = range.endSlot;
        }

        if (!nextPatientId || !nextDoctorId || !nextRoomId || !DATE_RE.test(nextDay)) {
          throw Object.assign(new Error('المريض والطبيب والغرفة والتاريخ مطلوبة'), { statusCode: 400 });
        }

        if (wantsReschedule) {
          await assertDoctor(client, req.user.tenantId, nextDoctorId);
          await assertRoom(client, req.user.tenantId, nextRoomId);
          if (nextStatus !== 'CANCELLED') {
            await assertNoOverlap(client, req.user.tenantId, {
              day: nextDay,
              doctorId: nextDoctorId,
              roomId: nextRoomId,
              slot: nextSlot,
              endSlot: nextEndSlot,
              excludeId: req.params.id,
            });
          }

          let linkedPlanItemId = row.plan_item_id;
          if (hasPlanItem) {
            if (!planItemId) {
              linkedPlanItemId = null;
            } else {
              const hasPlan = await client.query(
                `SELECT to_regclass('public.treatment_plan_items') AS t`
              );
              if (!hasPlan.rows[0]?.t) {
                throw Object.assign(new Error('خطة العلاج غير متاحة بعد — أعد المحاولة بدون ربط بند'), {
                  statusCode: 400,
                });
              }
              const planCheck = await client.query(
                `SELECT tpi.id
                 FROM treatment_plan_items tpi
                 JOIN treatment_plans tp ON tp.id = tpi.plan_id
                 WHERE tpi.id = $1 AND tp.tenant_id = $2 AND tp.patient_id = $3 AND tpi.status IN ('PLANNED', 'IN_PROGRESS')`,
                [planItemId, req.user.tenantId, nextPatientId]
              );
              if (planCheck.rowCount === 0) {
                throw Object.assign(new Error('بند خطة العلاج غير صالح'), { statusCode: 400 });
              }
              linkedPlanItemId = planItemId;
            }
          }

          const updated = await client.query(
            `UPDATE appointments SET
               patient_id = $2,
               doctor_id = $3,
               room_id = $4,
               notes = $5,
               appointment_date = $6::date,
               slot = $7,
               end_slot = $8,
               starts_at = ($6::date + $9::time),
               plan_item_id = $10,
               status = $11
             WHERE id = $1`,
            [
              req.params.id,
              nextPatientId,
              nextDoctorId,
              nextRoomId,
              nextNotes,
              nextDay,
              nextSlot,
              nextEndSlot,
              nextSlot,
              linkedPlanItemId,
              nextStatus,
            ]
          );
          if (updated.rowCount === 0) {
            throw Object.assign(new Error('الموعد غير موجود'), { statusCode: 404 });
          }
          return;
        }

        const result = await client.query(
          `UPDATE appointments SET status = $2 WHERE id = $1`,
          [req.params.id, nextStatus]
        );
        if (result.rowCount === 0) {
          throw Object.assign(new Error('الموعد غير موجود'), { statusCode: 404 });
        }
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23505') {
        const msg = String(err.detail || '').includes('room_id')
          ? 'يتعارض الموعد مع حجز آخر في نفس الغرفة'
          : 'يتعارض الموعد مع حجز آخر لنفس الطبيب';
        return res.status(409).json({ error: msg });
      }
      console.error('Updating appointment failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث الموعد' });
    }
  }
);

module.exports = router;
