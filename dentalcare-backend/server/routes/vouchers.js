// routes/vouchers.js
// سند قبض — دفعات نقدية متعددة العملات + شيكات بعملة لكل شيك.

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveCurrencyContext, toBaseAmount } = require('../accounting/currency');
const { tryAutoSend } = require('../whatsapp/service');

async function resolveAccountByCode(tenantId, code) {
  return withTenantClient(tenantId, async (client) => {
    const result = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = TRUE LIMIT 1`,
      [code]
    );
    return result.rows[0]?.id || null;
  });
}

async function resolveCashBoxAccount(tenantId, currencyId, boxKind, fallbackCode) {
  return withTenantClient(tenantId, async (client) => {
    if (currencyId) {
      const byCurrency = await client.query(
        `SELECT account_id FROM cash_boxes
         WHERE currency_id = $1 AND box_kind = $2 AND is_active = TRUE
         ORDER BY is_system DESC, created_at ASC
         LIMIT 1`,
        [currencyId, boxKind]
      );
      if (byCurrency.rowCount > 0) return byCurrency.rows[0].account_id;
    }
    const byCode = await client.query(
      `SELECT id FROM chart_of_accounts WHERE account_code = $1 AND is_active = TRUE LIMIT 1`,
      [fallbackCode]
    );
    return byCode.rows[0]?.id || null;
  });
}

function normalizeCashPayments(body) {
  if (Array.isArray(body.cashPayments) && body.cashPayments.length > 0) {
    return body.cashPayments.map((p) => ({
      cashAccountId: p.cashAccountId,
      currencyId: p.currencyId || null,
      amount: Number(p.amount),
    }));
  }
  // توافق خلفي: مبلغ واحد + حساب واحد
  if (body.cashAccountId && Number(body.amount) > 0) {
    return [{
      cashAccountId: body.cashAccountId,
      currencyId: body.currencyId || null,
      amount: Number(body.amount),
    }];
  }
  return [];
}

router.post(
  '/receipts',
  requireAuth,
  requirePermission('receipts', 'edit'),
  async (req, res) => {
    const { patientAccountId, memo, idempotencyKey, checks, date } = req.body;
    const entryDate = date ? String(date).slice(0, 10) : null;

    if (!patientAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المريض/الذمة' });
    }

    const cashPayments = normalizeCashPayments(req.body);
    const hasChecks = Array.isArray(checks) && checks.length > 0;

    for (const p of cashPayments) {
      if (!p.cashAccountId || !Number.isFinite(p.amount) || p.amount <= 0) {
        return res.status(400).json({ error: 'كل دفعة نقدية تحتاج حساب صندوق ومبلغًا أكبر من صفر' });
      }
    }

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
    }

    if (cashPayments.length === 0 && !hasChecks) {
      return res.status(400).json({ error: 'أدخل مبلغًا نقديًا أو شيكًا واحدًا على الأقل' });
    }

    let checksHoldingId = null;
    if (hasChecks) {
      // يُحل لكل شيك حسب عملته؛ هذا الافتراضي لعملة الأساس
      checksHoldingId = await resolveCashBoxAccount(req.user.tenantId, null, 'CHECKS_IN', '1200');
      if (!checksHoldingId) {
        return res.status(400).json({ error: 'حساب حافظة الشيكات الواردة غير موجود' });
      }
    }

    const journalEntryIds = [];
    const createdChecks = [];
    try {
      for (let i = 0; i < cashPayments.length; i += 1) {
        const p = cashPayments[i];
        const currency = await resolveCurrencyContext(req.user.tenantId, p.currencyId || null);
        const baseAmount = toBaseAmount(p.amount, currency.rate);
        const { journalEntryId } = await postJournalEntry({
          tenantId: req.user.tenantId,
          userId: req.user.userId,
          sourceType: 'RECEIPT',
          memo,
          entryDate,
          idempotencyKey: i === 0 ? idempotencyKey : `${idempotencyKey || 'rcpt'}:cash:${i}`,
          currencyId: currency.currencyId,
          exchangeRate: currency.rate,
          lines: [
            { accountId: p.cashAccountId, debit: baseAmount },
            { accountId: patientAccountId, credit: baseAmount },
          ],
        });
        journalEntryIds.push(journalEntryId);
      }

      if (hasChecks) {
        for (const c of checks) {
          const currency = await resolveCurrencyContext(req.user.tenantId, c.currencyId || null);
          const foreignAmount = Number(c.amount);
          const baseAmount = toBaseAmount(foreignAmount, currency.rate);
          const holdingId = c.cashAccountId
            || await resolveCashBoxAccount(req.user.tenantId, currency.currencyId, 'CHECKS_IN', '1200')
            || checksHoldingId;
          const { journalEntryId } = await postJournalEntry({
            tenantId: req.user.tenantId,
            userId: req.user.userId,
            sourceType: 'RECEIPT',
            memo,
            entryDate,
            idempotencyKey: c.idempotencyKey,
            currencyId: currency.currencyId,
            exchangeRate: currency.rate,
            lines: [
              { accountId: holdingId, debit: baseAmount },
              { accountId: patientAccountId, credit: baseAmount },
            ],
          });

          const inserted = await withTenantClient(req.user.tenantId, async (client) => {
            const result = await client.query(
              `INSERT INTO checks
                 (tenant_id, journal_entry_id, check_number, bank_name, due_date,
                  drawer_name, amount, holding_account_id, check_type,
                  currency_id, exchange_rate, foreign_amount, bank_number,
                  location, location_account_id, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RECEIVED', $9, $10, $11, $12,
                       'CHECKS_BOX', $8, 'PENDING')
               RETURNING id, check_number`,
              [
                req.user.tenantId, journalEntryId, c.checkNumber, c.bankName,
                c.dueDate, c.drawerName || null, baseAmount, holdingId,
                currency.currencyId, currency.rate, foreignAmount,
                c.bankNumber || null,
              ]
            );
            return result.rows[0];
          });

          journalEntryIds.push(journalEntryId);
          createdChecks.push({
            id: inserted.id,
            checkNumber: inserted.check_number,
            journalEntryId,
          });
        }
      }

      const cashTotal = cashPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const checksTotal = hasChecks
        ? checks.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
        : 0;
      const paymentTotal = cashTotal + checksTotal;
      const tenantId = req.user.tenantId;
      setImmediate(() => {
        tryAutoSend(tenantId, {
          kind: 'payment',
          patientAccountId,
          amount: paymentTotal,
          entryDate,
        }).catch(() => {});
      });

      return res.status(201).json({
        success: true,
        journalEntryId: journalEntryIds[0],
        journalEntryIds,
        checks: createdChecks,
      });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Receipt posting failed:', err);
      return res.status(500).json({
        error: 'تعذّر ترحيل السند — راجع حافظة الشيكات لمعرفة ما تم ترحيله فعليًا قبل إعادة المحاولة',
        postedSoFar: journalEntryIds,
      });
    }
  }
);

module.exports = router;
