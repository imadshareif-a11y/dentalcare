// routes/payments.js
// سند صرف — دفعات نقدية متعددة العملات + شيكات بعملة لكل شيك.

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveCurrencyContext, toBaseAmount } = require('../accounting/currency');
const {
  validateCheckbookIssue,
  advanceCheckbookAfterIssue,
} = require('../accounting/checkbooks');

async function resolveAccountByCode(client, tenantId, code) {
  const result = await client.query(
    `SELECT id FROM chart_of_accounts
     WHERE tenant_id = $1 AND account_code = $2 AND is_active = TRUE
     LIMIT 1`,
    [tenantId, code]
  );
  return result.rows[0]?.id || null;
}

async function resolveCashBoxAccount(client, tenantId, currencyId, boxKind, fallbackCode) {
  if (currencyId) {
    const byCurrency = await client.query(
      `SELECT account_id FROM cash_boxes
       WHERE tenant_id = $3 AND currency_id = $1 AND box_kind = $2 AND is_active = TRUE
       ORDER BY is_system DESC, created_at ASC
       LIMIT 1`,
      [currencyId, boxKind, tenantId]
    );
    if (byCurrency.rowCount > 0) return byCurrency.rows[0].account_id;
  }
  return resolveAccountByCode(client, tenantId, fallbackCode);
}

async function resolveCashBoxAccountScoped(tenantId, currencyId, boxKind, fallbackCode) {
  return withTenantClient(tenantId, async (client) => (
    resolveCashBoxAccount(client, tenantId, currencyId, boxKind, fallbackCode)
  ));
}

function normalizeCashPayments(body) {
  if (Array.isArray(body.cashPayments) && body.cashPayments.length > 0) {
    return body.cashPayments.map((p) => ({
      cashAccountId: p.cashAccountId,
      currencyId: p.currencyId || null,
      amount: Number(p.amount),
    }));
  }
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
  '/payments',
  requireAuth,
  requirePermission('payments', 'edit'),
  async (req, res) => {
    const { payeeAccountId, memo, idempotencyKey, checks, date } = req.body;
    const entryDate = date ? String(date).slice(0, 10) : null;

    if (!payeeAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المستفيد' });
    }

    const cashPayments = normalizeCashPayments(req.body);
    const hasChecks = Array.isArray(checks) && checks.length > 0;

    for (const p of cashPayments) {
      if (!p.cashAccountId || !Number.isFinite(p.amount) || p.amount <= 0) {
        return res.status(400).json({ error: 'كل دفعة نقدية تحتاج حساب صندوق ومبلغًا أكبر من صفر' });
      }
      if (p.cashAccountId === payeeAccountId) {
        return res.status(400).json({ error: 'لا يمكن أن يكون حساب الصندوق مطابقًا للمستفيد' });
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
      checksHoldingId = await resolveCashBoxAccountScoped(req.user.tenantId, null, 'CHECKS_OUT', '2200');
      if (!checksHoldingId) {
        return res.status(400).json({ error: 'حساب حافظة الشيكات الصادرة غير موجود' });
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
          sourceType: 'PAYMENT',
          memo,
          entryDate,
          idempotencyKey: i === 0 ? idempotencyKey : `${idempotencyKey || 'pay'}:cash:${i}`,
          currencyId: currency.currencyId,
          exchangeRate: currency.rate,
          lines: [
            { accountId: payeeAccountId, debit: baseAmount },
            { accountId: p.cashAccountId, credit: baseAmount },
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
            || await resolveCashBoxAccountScoped(req.user.tenantId, currency.currencyId, 'CHECKS_OUT', '2200')
            || checksHoldingId;
          const { journalEntryId } = await postJournalEntry({
            tenantId: req.user.tenantId,
            userId: req.user.userId,
            sourceType: 'PAYMENT',
            memo,
            entryDate,
            idempotencyKey: c.idempotencyKey,
            currencyId: currency.currencyId,
            exchangeRate: currency.rate,
            lines: [
              { accountId: payeeAccountId, debit: baseAmount },
              { accountId: holdingId, credit: baseAmount },
            ],
          });

          const inserted = await withTenantClient(req.user.tenantId, async (client) => {
            let bankAccountId = c.bankAccountId || null;
            let checkbookId = c.checkbookId || null;
            let checkNumber = c.checkNumber;
            let bankNumber = c.bankNumber || null;
            let bankName = c.bankName;

            if (bankAccountId) {
              const validated = await validateCheckbookIssue(client, req.user.tenantId, {
                bankAccountId,
                checkbookId,
                checkNumber: c.checkNumber,
              });
              checkbookId = validated.checkbook.id;
              checkNumber = validated.checkNumber;
              bankNumber = validated.checkbook.bank_number || bankNumber;
              if (!bankName && validated.checkbook.bank_name) {
                bankName = validated.checkbook.bank_name;
              }
              await advanceCheckbookAfterIssue(
                client,
                checkbookId,
                checkNumber,
                validated.checkbook.serial_from,
                validated.checkbook.serial_to
              );
            }

            const result = await client.query(
              `INSERT INTO checks
                 (tenant_id, journal_entry_id, check_number, bank_name, due_date,
                  drawer_name, amount, holding_account_id, check_type,
                  currency_id, exchange_rate, foreign_amount, bank_number,
                  location, location_account_id, status, bank_account_id, checkbook_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ISSUED', $9, $10, $11, $12,
                       'CHECKS_BOX', $8, 'PENDING', $13, $14)
               RETURNING id, check_number`,
              [
                req.user.tenantId, journalEntryId, checkNumber, bankName,
                c.dueDate, c.drawerName || null, baseAmount, holdingId,
                currency.currencyId, currency.rate, foreignAmount,
                bankNumber,
                bankAccountId,
                checkbookId,
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

      return res.status(201).json({
        success: true,
        journalEntryId: journalEntryIds[0],
        journalEntryIds,
        checks: createdChecks,
      });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Payment posting failed:', err);
      return res.status(500).json({
        error: 'تعذّر ترحيل السند — راجع حافظة الشيكات لمعرفة ما تم ترحيله فعليًا قبل إعادة المحاولة',
        postedSoFar: journalEntryIds,
      });
    }
  }
);

module.exports = router;
