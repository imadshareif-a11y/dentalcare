// routes/clinical.js
// -----------------------------------------------------------
// هون بالضبط نقطة "توحيد المريض والذمة" يلي طلبتها بالمحادثة
// الأصلية. لاحظ إنه ما في أي منطق محاسبي هون غير استدعاء
// postJournalEntry() — القسم الطبي "يطلب" ترحيل، ومحرك المحاسبة
// هو يلي بيقرر كيف يترحّل، مش العكس.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

router.post(
  '/clinical/commit-session',
  requireAuth,
  requirePermission('clinical', 'edit'),
  async (req, res) => {
    const { patientId, revenueAccountId, treatments, doctorId, idempotencyKey } = req.body;
    // treatments: [{ tooth, name, cost }, ...]

    if (!patientId || !revenueAccountId || !Array.isArray(treatments) || treatments.length === 0) {
      return res.status(400).json({ error: 'بيانات الجلسة غير مكتملة' });
    }

    try {
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

      // لو محدَّد طبيب ونوع تعويضه "نسبة"، نحسب عمولته تلقائيًا
      // ونضيفها كسطرين إضافيين *بنفس القيد* — القيد بيضل متوازن
      // لأنهم زوج متوازن لحالهم (مدين مصروف = دائن ذمة الطبيب)
      let doctorLines = [];
      let doctorNameForMemo = '';
      if (doctorId) {
        const doctorInfo = await withTenantClient(req.user.tenantId, async (client) => {
          const result = await client.query(
            `SELECT p.name, p.account_id, d.compensation_type, d.percentage_rate
             FROM doctors d JOIN parties p ON p.id = d.party_id
             WHERE d.party_id = $1`,
            [doctorId]
          );
          return result.rows[0] || null;
        });

        if (doctorInfo) {
          doctorNameForMemo = doctorInfo.name;
          if (doctorInfo.compensation_type === 'PERCENTAGE' && doctorInfo.percentage_rate) {
            const commissionExpenseAccountId = await withTenantClient(req.user.tenantId, async (client) => {
              const result = await client.query(
                `SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = '5100'`,
                [req.user.tenantId]
              );
              return result.rows[0]?.id || null;
            });

            if (commissionExpenseAccountId) {
              const commission = Math.round(sessionTotal * (doctorInfo.percentage_rate / 100) * 100) / 100;
              if (commission > 0) {
                doctorLines = [
                  { accountId: commissionExpenseAccountId, debit: commission, lineMemo: `عمولة د. ${doctorInfo.name}` },
                  { accountId: doctorInfo.account_id, credit: commission, lineMemo: `عمولة جلسة — ${treatments.length} إجراء` },
                ];
              }
            }
          }
        }
      }

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CLINICAL_SESSION',
        sourceRefId: patientId,
        memo: `جلسة عالجية — ${treatments.length} إجراء${doctorNameForMemo ? ` — د. ${doctorNameForMemo}` : ''}`,
        idempotencyKey,
        lines: [
          { accountId: patientAccountId, debit: sessionTotal, lineMemo: 'ترحيل تكلفة الجلسة لذمة المريض' },
          ...treatments.map((t) => ({
            accountId: revenueAccountId,
            credit: Number(t.cost),
            lineMemo: `السن #${t.tooth} - ${t.name}`,
          })),
          ...doctorLines,
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
