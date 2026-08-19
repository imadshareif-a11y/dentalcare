// routes/payments.js
// -----------------------------------------------------------
// سند صرف: من حـ/ المورد أو المصروف (مدين) إلى حـ/ الخزينة أو
// البنك (دائن). نفس نمط سند القبض تمامًا، بس بالاتجاه المعاكس.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

router.post(
  '/payments',
  requireAuth,
  requirePermission('payments', 'edit'),
  async (req, res) => {
    // payeeAccountId: حساب المورد أو بند المصروف المباشر
    // cashAccountId: الصندوق/البنك، أو حساب "حافظة الشيكات الصادرة"
    // checks (اختياري): [{ checkNumber, bankName, dueDate, drawerName, amount, idempotencyKey }, ...]
    // نفس منطق سند القبض بالضبط: كل شيك = قيد مستقل بذاته
    const { payeeAccountId, cashAccountId, amount, memo, idempotencyKey, checks } = req.body;

    if (!payeeAccountId || !cashAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المستفيد وحساب الخزينة/البنك' });
    }
    if (payeeAccountId === cashAccountId) {
      return res.status(400).json({ error: 'لا يمكن أن يكون الحسابان متطابقين' });
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
            sourceType: 'PAYMENT',
            memo,
            idempotencyKey: c.idempotencyKey,
            lines: [
              { accountId: payeeAccountId, debit: numericAmount },
              { accountId: cashAccountId, credit: numericAmount },
            ],
          });

          await withTenantClient(req.user.tenantId, async (client) => {
            await client.query(
              `INSERT INTO checks
                 (tenant_id, journal_entry_id, check_number, bank_name, due_date,
                  drawer_name, amount, holding_account_id, check_type)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ISSUED')`,
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
        console.error('Multi-check payment posting failed:', err);
        return res.status(500).json({
          error: 'تعذّر ترحيل أحد الشيكات — راجع حافظة الشيكات لمعرفة ما تم ترحيله فعليًا قبل إعادة المحاولة',
          postedSoFar: journalEntryIds,
        });
      }
    }

    // مسار السند العادي (بلا شيكات)
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'PAYMENT',
        memo,
        idempotencyKey,
        lines: [
          { accountId: payeeAccountId, debit: numericAmount },
          { accountId: cashAccountId, credit: numericAmount },
        ],
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Payment posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل السند، يرجى المحاولة لاحقًا' });
    }
  }
);

module.exports = router;
