// routes/checks.js
// -----------------------------------------------------------
// دورة حياة الشيك: PENDING (بالحافظة) → CLEARED (تحصّل بالبنك
// فعليًا) أو BOUNCED (ارتجع). كل انتقال حالة = قيد محاسبي حقيقي
// عبر postJournalEntry/reverseJournalEntry — لا يوجد أي مكان
// هون بيعدّل رصيد مباشرة.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, reverseJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

// قائمة الشيكات (الحافظة) — قابلة للفلترة بالحالة
router.get('/checks', requireAuth, async (req, res) => {
  const { status } = req.query; // PENDING / CLEARED / BOUNCED (اختياري)

  try {
    const checks = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT c.id, c.check_number, c.bank_name, c.due_date, c.drawer_name,
                c.status, c.amount, c.check_type,
                a.account_code AS holding_account_code
         FROM checks c
         LEFT JOIN chart_of_accounts a ON a.id = c.holding_account_id
         WHERE ($1::VARCHAR IS NULL OR c.status = $1)
         ORDER BY c.due_date ASC`,
        [status || null]
      );
      return result.rows;
    });
    res.json(checks);
  } catch (err) {
    console.error('Fetching checks failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الشيكات' });
  }
});

// تحصيل شيك: من حافظة الشيكات (دائن) إلى البنك الفعلي (مدين)
router.post(
  '/checks/:id/clear',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT']),
  async (req, res) => {
    const { id } = req.params;
    const { bankAccountId } = req.body;

    if (!bankAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب البنك المستلم' });
    }

    try {
      const check = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, amount, holding_account_id, status, check_type
           FROM checks WHERE id = $1`,
          [id]
        );
        return result.rows[0] || null;
      });

      if (!check) return res.status(404).json({ error: 'الشيك غير موجود' });
      if (check.status !== 'PENDING') {
        return res.status(400).json({ error: 'هذا الشيك ليس بانتظار التحصيل' });
      }

      // شيك وارد (RECEIVED): من حافظة الشيكات (دائن) إلى البنك (مدين)
      // شيك صادر (ISSUED): من البنك (دائن) إلى حافظة الشيكات (مدين) — تصفية الالتزام
      const lines = check.check_type === 'RECEIVED'
        ? [
            { accountId: bankAccountId, debit: check.amount },
            { accountId: check.holding_account_id, credit: check.amount },
          ]
        : [
            { accountId: check.holding_account_id, debit: check.amount },
            { accountId: bankAccountId, credit: check.amount },
          ];

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CHECK_CLEARING',
        sourceRefId: id,
        memo: 'تحصيل شيك',
        lines,
      });

      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `UPDATE checks SET status = 'CLEARED', cleared_journal_entry_id = $1 WHERE id = $2`,
          [journalEntryId, id]
        );
      });

      res.json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Check clearing failed:', err);
      res.status(500).json({ error: 'تعذّر تحصيل الشيك' });
    }
  }
);

// ارتجاع شيك: يلغي القيد الأصلي بقيد عكسي (المريض يرجع مديون،
// أو التزامنا تجاه المورد يرجع قائم)
router.post(
  '/checks/:id/bounce',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT']),
  async (req, res) => {
    const { id } = req.params;

    try {
      const check = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, journal_entry_id, status FROM checks WHERE id = $1`,
          [id]
        );
        return result.rows[0] || null;
      });

      if (!check) return res.status(404).json({ error: 'الشيك غير موجود' });
      if (check.status !== 'PENDING') {
        return res.status(400).json({ error: 'لا يمكن ارتجاع شيك تم تحصيله أو ارتجاعه مسبقًا' });
      }

      const { reversalEntryId } = await reverseJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        originalEntryId: check.journal_entry_id,
        memo: 'ارتجاع شيك',
      });

      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(`UPDATE checks SET status = 'BOUNCED' WHERE id = $1`, [id]);
      });

      res.json({ success: true, reversalEntryId });
    } catch (err) {
      console.error('Check bounce failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل ارتجاع الشيك' });
    }
  }
);

// تظهير شيك مقبوض: بدل تحصيله بالبنك، يُعطى مباشرة لمورد كتسديد.
// من حـ/ المستفيد (مدين) إلى حـ/ حافظة الشيكات الواردة (دائن) —
// الفلوس ما بتمر بالبنك أبدًا، بس التزامنا تجاه المورد بيتصفّى
router.post(
  '/checks/:id/endorse',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT']),
  async (req, res) => {
    const { id } = req.params;
    const { payeeAccountId } = req.body;

    if (!payeeAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المستفيد (المورد)' });
    }

    try {
      const check = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, amount, holding_account_id, status, check_type FROM checks WHERE id = $1`,
          [id]
        );
        return result.rows[0] || null;
      });

      if (!check) return res.status(404).json({ error: 'الشيك غير موجود' });
      if (check.status !== 'PENDING') {
        return res.status(400).json({ error: 'هذا الشيك ليس بانتظار التحصيل' });
      }
      if (check.check_type !== 'RECEIVED') {
        return res.status(400).json({ error: 'لا يمكن تظهير إلا شيك مقبوض من ذمة' });
      }

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CHECK_ENDORSEMENT',
        sourceRefId: id,
        memo: 'تظهير شيك لمورد',
        lines: [
          { accountId: payeeAccountId, debit: check.amount },
          { accountId: check.holding_account_id, credit: check.amount },
        ],
      });

      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `UPDATE checks SET status = 'ENDORSED', endorsed_journal_entry_id = $1 WHERE id = $2`,
          [journalEntryId, id]
        );
      });

      res.json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Check endorsement failed:', err);
      res.status(500).json({ error: 'تعذّر تظهير الشيك' });
    }
  }
);

module.exports = router;
