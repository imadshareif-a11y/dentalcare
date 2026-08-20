const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveCurrencyContext, toBaseAmount } = require('../accounting/currency');

router.post(
  '/purchase-invoices',
  requireAuth,
  requirePermission('payments', 'edit'),
  async (req, res) => {
    const { supplierAccountId, expenseAccountId, amount, memo, idempotencyKey, currencyId } = req.body;
    const numericAmount = Number(amount);

    if (!supplierAccountId || !expenseAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المورد وحساب المشتريات/المصروف' });
    }
    if (supplierAccountId === expenseAccountId) {
      return res.status(400).json({ error: 'لا يمكن أن يكون الحسابان متطابقين' });
    }
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    }

    let currency;
    try {
      currency = await resolveCurrencyContext(req.user.tenantId, currencyId || null);
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    const baseAmount = toBaseAmount(numericAmount, currency.rate);

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'PURCHASE_INVOICE',
        memo,
        idempotencyKey,
        currencyId: currency.currencyId,
        exchangeRate: currency.rate,
        lines: [
          { accountId: expenseAccountId, debit: baseAmount },
          { accountId: supplierAccountId, credit: baseAmount },
        ],
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Purchase invoice posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل فاتورة المشتريات' });
    }
  }
);

module.exports = router;
