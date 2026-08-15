// routes/vouchers.js
// -----------------------------------------------------------
// مثال: سند قبض. لاحظ إنه هذا الملف ما بيلمس journal_entries
// أو journal_entry_lines مباشرة أبدًا — كل شي بيمر عبر
// postJournalEntry() من accounting/engine.js.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

// سند قبض: من حـ/ الخزينة أو البنك (مدين) إلى حـ/ ذمة المريض (دائن)
router.post(
  '/receipts',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT']),
  async (req, res) => {
    const { cashAccountId, patientAccountId, amount, memo } = req.body;

    // تحقق أولي من شكل البيانات — قبل ما توصل لمحرك المحاسبة
    if (!cashAccountId || !patientAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب الخزينة وحساب المريض' });
    }
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
        lines: [
          { accountId: cashAccountId, debit: numericAmount },
          { accountId: patientAccountId, credit: numericAmount },
        ],
      });

      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        // من المفترض ما توصل هون أصلاً (سطرين فقط بنفس المبلغ)،
        // بس منسيبها كتحقق دفاعي إضافي
        return res.status(400).json({ error: err.message });
      }
      console.error('Receipt posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل السند، يرجى المحاولة لاحقًا' });
    }
  }
);

module.exports = router;
