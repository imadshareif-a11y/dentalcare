// routes/payments.js
// -----------------------------------------------------------
// سند صرف: من حـ/ المورد أو المصروف (مدين) إلى حـ/ الخزينة أو
// البنك (دائن). نفس نمط سند القبض تمامًا، بس بالاتجاه المعاكس.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

router.post(
  '/payments',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT']),
  async (req, res) => {
    // payeeAccountId: حساب المورد أو بند المصروف المباشر
    const { payeeAccountId, cashAccountId, amount, memo } = req.body;

    if (!payeeAccountId || !cashAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المستفيد وحساب الخزينة/البنك' });
    }
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    }
    if (payeeAccountId === cashAccountId) {
      return res.status(400).json({ error: 'لا يمكن أن يكون الحسابان متطابقين' });
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'PAYMENT',
        memo,
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
