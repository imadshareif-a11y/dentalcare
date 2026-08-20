const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { tryAutoSend } = require('../whatsapp/service');

const SLOT_RE = /^([01]\d|2[0-3]):(00|30)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSlot(value) {
  const raw = String(value || '').trim();
  if (SLOT_RE.test(raw)) return raw;
  return null;
}

router.get(
  '/appointments',
  requireAuth,
  requireAnyPermission([['appointments', 'view'], ['clinical', 'view']]),
  async (req, res) => {
  const day = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.id, a.patient_id, a.doctor_id, a.starts_at, a.notes, a.status,
                a.appointment_date, a.slot,
                p.name AS patient_name, d.name AS doctor_name
         FROM appointments a
         JOIN parties p ON p.id = a.patient_id
         LEFT JOIN parties d ON d.id = a.doctor_id
         WHERE a.appointment_date = $1::date
         ORDER BY a.slot ASC`,
        [day]
      );
      return result.rows;
    });
    res.json(rows);
  } catch (err) {
    console.error('Listing appointments failed:', err);
    res.status(500).json({ error: 'تعذّر جلب المواعيد' });
  }
});

router.post(
  '/appointments',
  requireAuth,
  requireAnyPermission([['appointments', 'edit'], ['clinical', 'edit']]),
  async (req, res) => {
  const { patientId, doctorId, notes } = req.body;
  const day = String(req.body.date || '').slice(0, 10);
  const slot = normalizeSlot(req.body.slot);
  if (!patientId || !DATE_RE.test(day) || !slot) {
    return res.status(400).json({ error: 'المريض والتاريخ والوقت (كل 30 دقيقة) مطلوبة' });
  }
  try {
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      const taken = await client.query(
        `SELECT id FROM appointments
         WHERE appointment_date = $1::date AND slot = $2 AND status <> 'CANCELLED'
         LIMIT 1`,
        [day, slot]
      );
      if (taken.rowCount > 0) {
        throw Object.assign(new Error('هذا الوقت محجوز مسبقاً'), { statusCode: 409 });
      }
      const result = await client.query(
        `INSERT INTO appointments (tenant_id, patient_id, doctor_id, starts_at, notes, appointment_date, slot)
         VALUES ($1, $2, $3, ($4::date + $5::time), $6, $4::date, $7)
         RETURNING id`,
        [req.user.tenantId, patientId, doctorId || null, day, slot, notes || null, slot]
      );
      return result.rows[0];
    });

    // أتمتة تأكيد الموعد عبر واتساب (صامت عند الفشل)
    setImmediate(() => {
      tryAutoSend(req.user.tenantId, {
        kind: 'appointment',
        appointmentId: row.id,
      }).catch(() => {});
    });

    res.status(201).json({ success: true, id: row.id });
  } catch (err) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    if (err.code === '23505') {
      return res.status(409).json({ error: 'هذا الوقت محجوز مسبقاً' });
    }
    console.error('Creating appointment failed:', err);
    res.status(500).json({ error: 'تعذّر حفظ الموعد' });
  }
});

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
});

module.exports = router;
