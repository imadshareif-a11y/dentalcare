// routes/clinical.js
// -----------------------------------------------------------
// هون بالضبط نقطة "توحيد المريض والذمة" يلي طلبتها بالمحادثة
// الأصلية. لاحظ إنه ما في أي منطق محاسبي هون غير استدعاء
// postJournalEntry() — القسم الطبي "يطلب" ترحيل، ومحرك المحاسبة
// هو يلي بيقرر كيف يترحّل، مش العكس.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

router.post(
  '/clinical/commit-session',
  requireAuth,
  requireRole(['OWNER', 'DOCTOR', 'ACCOUNTANT']),
  async (req, res) => {
    const { patientId, revenueAccountId, treatments } = req.body;
    // treatments: [{ tooth, name, cost }, ...]

    if (!patientId || !revenueAccountId || !Array.isArray(treatments) || treatments.length === 0) {
      return res.status(400).json({ error: 'بيانات الجلسة غير مكتملة' });
    }

    try {
      // نجيب حساب ذمة المريض من جدول parties — هذا هو التوحيد
      // الفعلي: ما في حقل منفصل نمرره يدويًا، القسم الطبي بيسأل
      // "شو حساب هذا المريض؟" ومحرك المحاسبة بيجاوب من مصدر واحد
      const patientAccountId = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT account_id FROM parties WHERE id = $1 AND party_type = 'PATIENT'`,
          [patientId]
        );
        if (result.rows.length === 0 || !result.rows[0].account_id) {
          throw new Error('لا يوجد حساب ذمة مرتبط بهذا المريض');
        }
        return result.rows[0].account_id;
      });

      const sessionTotal = treatments.reduce((sum, t) => sum + Number(t.cost || 0), 0);
      if (sessionTotal <= 0) {
        return res.status(400).json({ error: 'إجمالي الجلسة يجب أن يكون أكبر من صفر' });
      }

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CLINICAL_SESSION',
        sourceRefId: patientId,
        memo: `جلسة عالجية — ${treatments.length} إجراء`,
        lines: [
          { accountId: patientAccountId, debit: sessionTotal, lineMemo: 'ترحيل تكلفة الجلسة لذمة المريض' },
          // كل إجراء كسطر دائن منفصل بنفس حساب الإيرادات — هيك
          // كشف الحساب بيقدر يعرض تفصيل كل إجراء لحاله، مش رقم
          // مجمّع بس
          ...treatments.map((t) => ({
            accountId: revenueAccountId,
            credit: Number(t.cost),
            lineMemo: `السن #${t.tooth} - ${t.name}`,
          })),
        ],
      });

      res.status(201).json({ success: true, journalEntryId, sessionTotal });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Clinical session commit failed:', err);
      res.status(500).json({ error: err.message || 'تعذّر ترحيل الجلسة' });
    }
  }
);

module.exports = router;
