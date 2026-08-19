// routes/vouchers.js
// -----------------------------------------------------------
// مثال: سند قبض. لاحظ إنه هذا الملف ما بيلمس journal_entries
// أو journal_entry_lines مباشرة أبدًا — كل شي بيمر عبر
// postJournalEntry() من accounting/engine.js.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

// سند قبض: من حـ/ الخزينة أو البنك أو حافظة الشيكات (مدين) إلى حـ/ ذمة المريض (دائن)
router.post(
  '/receipts',
  requireAuth,
  requirePermission('receipts', 'edit'),
  async (req, res) => {
    const { cashAccountId, patientAccountId, amount, memo, idempotencyKey, checks } = req.body;
    // checks (اختياري): [{ checkNumber, bankName, dueDate, drawerName, amount, idempotencyKey }, ...]
    // كل شيك = قيد محاسبي مستقل بذاته (لأنه كل شيك ممكن يترتجع
    // منفصل عن الباقي)، بس كلهم بيترحّلوا بنفس طلب الواجهة الواحد

    if (!cashAccountId || !patientAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب الخزينة وحساب المريض' });
    }

    const hasChecks = Array.isArray(checks) && checks.length > 0;

    if (hasChecks) {
      for (const c of checks) {
        if (!c.checkNumber || !c.bankName || !c.dueDate) {
          return res.status(400).json({ error: 'بيانات أحد الشيكات غير مكتملة (الرقم، البنك، تاريخ الاستحقاق)' });
        }
        if (!Number(c.amount) || Number(c.amount) <= 0) {
          return res.status(400).json({ error: 'مبلغ كل شيك يجب أن يكون أكبر من صفر' });
        }
        if (!c.idempotencyKey) {
          return res.status(400).json({ error: 'خطأ داخلي: مفتاح تكرار الشيك مفقود' });
        }
      }

      const journalEntryIds = [];
      try {
        for (const c of checks) {
          const numericAmount = Number(c.amount);
          const { journalEntryId } = await postJournalEntry({
            tenantId: req.user.tenantId,
            userId: req.user.userId,
            sourceType: 'RECEIPT',
            memo,
            idempotencyKey: c.idempotencyKey,
            lines: [
              { accountId: cashAccountId, debit: numericAmount },
              { accountId: patientAccountId, credit: numericAmount },
            ],
          });

          await withTenantClient(req.user.tenantId, async (client) => {
            await client.query(
              `INSERT INTO checks
                 (tenant_id, journal_entry_id, check_number, bank_name, due_date,
                  drawer_name, amount, holding_account_id, check_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RECEIVED')`,
              [
                req.user.tenantId, journalEntryId, c.checkNumber, c.bankName,
                c.dueDate, c.drawerName || null, numericAmount, cashAccountId,
              ]
            );
          });

          journalEntryIds.push(journalEntryId);
        }
        return res.status(201).json({ success: true, journalEntryIds });
      } catch (err) {
        if (err instanceof UnbalancedEntryError) {
          return res.status(400).json({ error: err.message });
        }
        // ملاحظة: لو فشل شيك بمنتصف القائمة، الشيكات قبله فعليًا
        // انترحّلت (كل وحدة transaction مستقلة) — لازم المستخدم
        // يراجع حافظة الشيكات ويعرف شو انترحّل فعليًا قبل ما يعيد
        // المحاولة، بدل ما يفترض فشل الكل
        console.error('Multi-check receipt posting failed:', err);
        return res.status(500).json({
          error: 'تعذّر ترحيل أحد الشيكات — راجع حافظة الشيكات لمعرفة ما تم ترحيله فعليًا قبل إعادة المحاولة',
          postedSoFar: journalEntryIds,
        });
      }
    }

    // مسار السند العادي (نقد/بنك مباشر، بدون شيكات)
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'RECEIPT',
        memo,
        idempotencyKey,
        lines: [
          { accountId: cashAccountId, debit: numericAmount },
          { accountId: patientAccountId, credit: numericAmount },
        ],
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Receipt posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل السند، يرجى المحاولة لاحقًا' });
    }
  }
);

module.exports = router;
