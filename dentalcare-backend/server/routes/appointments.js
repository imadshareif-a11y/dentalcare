const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { tryAutoSend } = require('../whatsapp/service');
const { ensureAppointmentsSchema } = require('../db/ensureAppointments');

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

async function assertDoctor(client, doctorId) {
  const result = await client.query(
    `SELECT id FROM parties WHERE id = $1 AND party_type = 'DOCTOR'`,
    [doctorId]
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

async function assertNoOverlap(client, { day, doctorId, roomId, slot, endSlot }) {
  const existing = await client.query(
    `SELECT id, slot, end_slot, doctor_id, room_id
     FROM appointments
     WHERE appointment_date = $1::date AND status <> 'CANCELLED'`,
    [day]
  );
  for (const row of existing.rows) {
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
        const params = [day];
        let extraFilter = '';
        if (doctorId) {
          params.push(doctorId);
          extraFilter += ` AND a.doctor_id = $${params.length}`;
        }
        if (roomId) {
          params.push(roomId);
          extraFilter += ` AND a.room_id = $${params.length}`;
        }
        const result = await client.query(
          `SELECT a.id, a.patient_id, a.doctor_id, a.room_id, a.starts_at, a.notes, a.status,
                  a.appointment_date, a.slot, COALESCE(a.end_slot, a.slot) AS end_slot,
                  a.plan_item_id,
                  p.name AS patient_name, d.name AS doctor_name,
                  r.name AS room_name, r.name_en AS room_name_en, r.name_he AS room_name_he,
                  tpi.tooth_fdi AS plan_tooth, tpi.name AS plan_item_name,
                  tpi.condition_code AS plan_condition_code,
                  pending.pending_plan
           FROM appointments a
           JOIN parties p ON p.id = a.patient_id
           LEFT JOIN parties d ON d.id = a.doctor_id
           LEFT JOIN rooms r ON r.id = a.room_id
           LEFT JOIN treatment_plan_items tpi ON tpi.id = a.plan_item_id
           LEFT JOIN LATERAL (
             SELECT string_agg('#' || tpi2.tooth_fdi || ' ' || tpi2.name, ' · ' ORDER BY tpi2.sort_order) AS pending_plan
             FROM treatment_plan_items tpi2
             JOIN treatment_plans tp ON tp.id = tpi2.plan_id
             WHERE tp.tenant_id = a.tenant_id
               AND tp.patient_id = a.patient_id
               AND tp.status = 'ACTIVE'
               AND tpi2.status = 'PLANNED'
           ) pending ON TRUE
           WHERE a.appointment_date = $1::date${extraFilter}
           ORDER BY a.slot ASC, d.name ASC NULLS LAST, r.name ASC NULLS LAST`,
          params
        );
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
        await assertDoctor(client, doctorId);
        await assertRoom(client, req.user.tenantId, roomId);
        await assertNoOverlap(client, { day, doctorId, roomId, slot, endSlot });

        if (planItemId) {
          const planCheck = await client.query(
            `SELECT tpi.id
             FROM treatment_plan_items tpi
             JOIN treatment_plans tp ON tp.id = tpi.plan_id
             WHERE tpi.id = $1 AND tp.tenant_id = $2 AND tp.patient_id = $3 AND tpi.status = 'PLANNED'`,
            [planItemId, req.user.tenantId, patientId]
          );
          if (planCheck.rowCount === 0) {
            throw Object.assign(new Error('بند خطة العلاج غير صالح'), { statusCode: 400 });
          }
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
            planItemId || null,
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
    const { status } = req.body;
    if (!['SCHEDULED', 'DONE', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: 'حالة الموعد غير صالحة' });
    }
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `UPDATE appointments SET status = $2 WHERE id = $1`,
          [req.params.id, status]
        );
        if (result.rowCount === 0) throw Object.assign(new Error('الموعد غير موجود'), { statusCode: 404 });
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Updating appointment failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث الموعد' });
    }
  }
);

module.exports = router;
