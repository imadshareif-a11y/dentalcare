// routes/bankEntries.js
// قيد بنكي: تحويل، حوالة واردة/صادرة، أو إيداع شيكات برسم التحصيل.

const express = require('express');
const router = express.Router();
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveCurrencyContext, toBaseAmount } = require('../accounting/currency');

const ACCESS = requireAnyPermission([
  ['journal', 'edit'],
  ['payments', 'edit'],
  ['accounts', 'edit'],
  ['checks', 'edit'],
]);

const OPS = new Set(['TRANSFER', 'INCOMING', 'OUTGOING', 'CHECK_DEPOSIT']);

async function resolveBankChartAccount(client, bankAccountId, { requireKind } = {}) {
  const result = await client.query(
    `SELECT ba.id, ba.chart_account_id, ba.name, ba.account_kind, ba.is_active,
            a.is_active AS account_active
     FROM bank_accounts ba
     JOIN chart_of_accounts a ON a.id = ba.chart_account_id
     WHERE ba.id = $1`,
    [bankAccountId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('الحساب البنكي غير موجود'), { statusCode: 400 });
  }
  const row = result.rows[0];
  if (!row.is_active || !row.account_active) {
    throw Object.assign(new Error('الحساب البنكي غير نشط'), { statusCode: 400 });
  }
  if (requireKind && row.account_kind !== requireKind) {
    throw Object.assign(
      new Error(requireKind === 'COLLECTION'
        ? 'إيداع الشيكات يجب أن يكون على حساب برسم التحصيل'
        : 'نوع الحساب البنكي غير مناسب'),
      { statusCode: 400 }
    );
  }
  return row;
}

async function assertActiveAccount(client, accountId) {
  const result = await client.query(
    `SELECT id FROM chart_of_accounts WHERE id = $1 AND is_active = TRUE`,
    [accountId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('الحساب المقابل غير موجود أو غير نشط'), { statusCode: 400 });
  }
}

router.post(
  '/bank-entries',
  requireAuth,
  ACCESS,
  async (req, res) => {
    const {
      operation,
      amount,
      currencyId,
      date,
      memo,
      idempotencyKey,
      fromBankAccountId,
      toBankAccountId,
      counterpartAccountId,
      checkIds,
    } = req.body;

    const op = String(operation || '').toUpperCase();
    if (!OPS.has(op)) {
      return res.status(400).json({ error: 'نوع العملية البنكية غير صالح' });
    }

    const entryDate = date ? String(date).slice(0, 10) : null;

    try {
      if (op === 'CHECK_DEPOSIT') {
        const ids = Array.isArray(checkIds)
          ? [...new Set(checkIds.map((x) => String(x)).filter(Boolean))]
          : [];
        if (ids.length === 0) {
          return res.status(400).json({ error: 'حدد شيكًا واحدًا على الأقل للإيداع' });
        }
        if (!toBankAccountId) {
          return res.status(400).json({ error: 'حدد حساب برسم التحصيل' });
        }

        const deposit = await withTenantClient(req.user.tenantId, async (client) => {
          const bank = await resolveBankChartAccount(client, toBankAccountId, {
            requireKind: 'COLLECTION',
          });

          const checksResult = await client.query(
            `SELECT id, amount, holding_account_id, location_account_id, location, status, check_type
             FROM checks
             WHERE id = ANY($1::uuid[])
             FOR UPDATE`,
            [ids]
          );
          if (checksResult.rowCount !== ids.length) {
            throw Object.assign(new Error('بعض الشيكات غير موجودة'), { statusCode: 400 });
          }

          const checks = checksResult.rows;
          for (const c of checks) {
            if (c.check_type !== 'RECEIVED') {
              throw Object.assign(new Error('يمكن إيداع الشيكات المقبوضة فقط'), { statusCode: 400 });
            }
            if (c.location !== 'CHECKS_BOX' || c.status !== 'PENDING') {
              throw Object.assign(
                new Error('الشيك يجب أن يكون في صندوق الشيكات قبل الإيداع'),
                { statusCode: 400 }
              );
            }
          }

          const lines = [];
          let total = 0;
          for (const c of checks) {
            const fromId = c.location_account_id || c.holding_account_id;
            const amt = Number(c.amount);
            total += amt;
            lines.push({
              accountId: bank.chart_account_id,
              debit: amt,
              lineMemo: `إيداع شيك برسم التحصيل`,
            });
            lines.push({
              accountId: fromId,
              credit: amt,
              lineMemo: `من صندوق الشيكات`,
            });
          }

          return { bank, checks, lines, total };
        });

        const { journalEntryId } = await postJournalEntry({
          tenantId: req.user.tenantId,
          userId: req.user.userId,
          sourceType: 'BANK_ENTRY',
          memo: memo || 'إيداع شيكات برسم التحصيل',
          entryDate,
          idempotencyKey,
          lines: deposit.lines,
        });

        await withTenantClient(req.user.tenantId, async (client) => {
          await client.query(
            `UPDATE checks SET
               status = 'DEPOSITED',
               location = 'BANK_COLLECTION',
               location_account_id = $1,
               collection_bank_account_id = $2,
               deposited_journal_entry_id = $3
             WHERE id = ANY($4::uuid[])`,
            [
              deposit.bank.chart_account_id,
              deposit.bank.id,
              journalEntryId,
              deposit.checks.map((c) => c.id),
            ]
          );
        });

        return res.status(201).json({
          success: true,
          journalEntryId,
          operation: op,
          checkCount: deposit.checks.length,
          amount: deposit.total,
        });
      }

      const foreignAmount = Number(amount);
      if (!Number.isFinite(foreignAmount) || foreignAmount <= 0) {
        return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
      }

      let currency;
      try {
        currency = await resolveCurrencyContext(req.user.tenantId, currencyId || null);
      } catch (err) {
        if (err.statusCode === 400) return res.status(400).json({ error: err.message });
        throw err;
      }

      const baseAmount = toBaseAmount(foreignAmount, currency.rate);

      const lines = await withTenantClient(req.user.tenantId, async (client) => {
        if (op === 'TRANSFER') {
          if (!fromBankAccountId || !toBankAccountId) {
            throw Object.assign(new Error('حدد حساب البنك المحوَّل منه وإليه'), { statusCode: 400 });
          }
          if (fromBankAccountId === toBankAccountId) {
            throw Object.assign(new Error('لا يمكن التحويل لنفس الحساب البنكي'), { statusCode: 400 });
          }
          const from = await resolveBankChartAccount(client, fromBankAccountId);
          const to = await resolveBankChartAccount(client, toBankAccountId);
          return [
            { accountId: to.chart_account_id, debit: baseAmount, lineMemo: 'تحويل وارد' },
            { accountId: from.chart_account_id, credit: baseAmount, lineMemo: 'تحويل صادر' },
          ];
        }

        if (op === 'INCOMING') {
          if (!toBankAccountId || !counterpartAccountId) {
            throw Object.assign(new Error('حدد الحساب البنكي المستلم والطرف المقابل'), { statusCode: 400 });
          }
          const to = await resolveBankChartAccount(client, toBankAccountId);
          await assertActiveAccount(client, counterpartAccountId);
          if (to.chart_account_id === counterpartAccountId) {
            throw Object.assign(new Error('الحساب البنكي والطرف المقابل لا يمكن أن يكونا نفس الحساب'), { statusCode: 400 });
          }
          return [
            { accountId: to.chart_account_id, debit: baseAmount, lineMemo: 'حوالة واردة' },
            { accountId: counterpartAccountId, credit: baseAmount, lineMemo: 'حوالة واردة' },
          ];
        }

        // OUTGOING
        if (!fromBankAccountId || !counterpartAccountId) {
          throw Object.assign(new Error('حدد الحساب البنكي الصادر والطرف المقابل'), { statusCode: 400 });
        }
        const from = await resolveBankChartAccount(client, fromBankAccountId);
        await assertActiveAccount(client, counterpartAccountId);
        if (from.chart_account_id === counterpartAccountId) {
          throw Object.assign(new Error('الحساب البنكي والطرف المقابل لا يمكن أن يكونا نفس الحساب'), { statusCode: 400 });
        }
        return [
          { accountId: counterpartAccountId, debit: baseAmount, lineMemo: 'حوالة صادرة' },
          { accountId: from.chart_account_id, credit: baseAmount, lineMemo: 'حوالة صادرة' },
        ];
      });

      const opLabel = op === 'TRANSFER' ? 'تحويل بنكي'
        : op === 'INCOMING' ? 'حوالة واردة'
          : 'حوالة صادرة';

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'BANK_ENTRY',
        memo: memo || opLabel,
        entryDate,
        idempotencyKey,
        currencyId: currency.currencyId,
        exchangeRate: currency.rate,
        lines,
      });

      return res.status(201).json({ success: true, journalEntryId, operation: op });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Bank entry posting failed:', err);
      return res.status(500).json({ error: 'تعذّر ترحيل القيد البنكي' });
    }
  }
);

module.exports = router;
