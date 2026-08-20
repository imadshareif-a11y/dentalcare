const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission, requireClinicContext } = require('../middleware/auth');
const {
  sendPatientWhatsapp,
  sendTomorrowReminders,
} = require('../whatsapp/service');

router.post(
  '/whatsapp/send',
  requireAuth,
  requireClinicContext,
  requireAnyPermission([
    ['clinical', 'edit'],
    ['appointments', 'edit'],
    ['receipts', 'edit'],
    ['patients', 'edit'],
  ]),
  async (req, res) => {
    const { kind, patientId, patientAccountId, appointmentId, amount, entryDate, skipDedupe } = req.body || {};
    if (!['appointment', 'reminder', 'payment', 'balance'].includes(kind)) {
      return res.status(400).json({ error: 'نوع الرسالة غير صالح' });
    }
    try {
      const result = await sendPatientWhatsapp(req.user.tenantId, {
        kind,
        patientId: patientId || null,
        patientAccountId: patientAccountId || null,
        appointmentId: appointmentId || null,
        amount: amount != null ? Number(amount) : null,
        entryDate: entryDate || null,
        skipDedupe: Boolean(skipDedupe),
      });
      if (result.skipped) {
        return res.json({ success: true, skipped: true, reason: result.reason });
      }
      res.json({ success: true, providerRef: result.providerRef || null });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('WhatsApp send failed:', err);
      res.status(500).json({ error: 'تعذّر إرسال رسالة واتساب' });
    }
  }
);

router.post(
  '/whatsapp/reminders/run',
  requireAuth,
  requireClinicContext,
  requireAnyPermission([['clinical', 'view'], ['appointments', 'view'], ['clinical', 'edit']]),
  async (req, res) => {
    try {
      const result = await sendTomorrowReminders(req.user.tenantId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('WhatsApp reminders failed:', err);
      res.status(500).json({ error: 'تعذّر تشغيل تذكيرات واتساب' });
    }
  }
);

module.exports = router;
