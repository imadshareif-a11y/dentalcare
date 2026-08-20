const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveCurrencyContext, toBaseAmount } = require('../accounting/currency');

const canPostNote = requireAnyPermission([
  ['receipts', 'edit'],
  ['payments', 'edit'],
  ['journal', 'edit'],
]);

function postNote(sourceType, creditTheParty) {
  return async (req, res) => {
    const { partyAccountId, discountAccountId, amount, memo, idempotencyKey, currencyId } = req.body;
    const numericAmount = Number(amount);

    if (!partyAccountId || !discountAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب الذمة وحساب الخصم' });
    }
    if (partyAccountId === discountAccountId) {
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
    const lines = creditTheParty
      ? [
          { accountId: discountAccountId, debit: baseAmount },
          { accountId: partyAccountId, credit: baseAmount },
        ]
      : [
          { accountId: partyAccountId, debit: baseAmount },
          { accountId: discountAccountId, credit: baseAmount },
        ];

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType,
        memo,
        idempotencyKey,
        currencyId: currency.currencyId,
        exchangeRate: currency.rate,
        lines,
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error(`${sourceType} posting failed:`, err);
      res.status(500).json({ error: 'تعذّر ترحيل الإشعار' });
    }
  };
}

router.post('/credit-notes', requireAuth, canPostNote, postNote('CREDIT_NOTE', true));
router.post('/debit-notes', requireAuth, canPostNote, postNote('DEBIT_NOTE', false));

module.exports = router;
