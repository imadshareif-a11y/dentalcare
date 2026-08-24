// accounting/engine.js
// -----------------------------------------------------------
// *** قاعدة صارمة: أي كود بأي مكان بالمشروع بدو يسجّل عملية
// مالية، لازم يمر من خلال postJournalEntry() هون. ممنوع أي
// route أو دالة تانية تكتب INSERT مباشر على journal_entries
// أو journal_entry_lines. ***
//
// هاي القاعدة هي يلي كانت مفقودة بمشروع Gemini — كل endpoint
// كان عنده منطقه الخاص لتحديث الرصيد (if/else مختلف بكل مكان)،
// فأي تعديل بمكان كان بيكسر مكان تاني.
// -----------------------------------------------------------

const { withTenantClient } = require('../db/pool');
const { assertEntryDateAllowed, ClosedFiscalYearError } = require('./fiscalYears');
const { nextDocumentNumber } = require('../settings/numbering');
const {
  FX_SOURCE_TYPE,
  reconcileAfterJournalEntry,
} = require('./fxReconciliation');

class UnbalancedEntryError extends Error {
  constructor(totalDebit, totalCredit) {
    super(`القيد غير متوازن: مجموع المدين ${totalDebit} لا يساوي مجموع الدائن ${totalCredit}`);
    this.name = 'UnbalancedEntryError';
    this.totalDebit = totalDebit;
    this.totalCredit = totalCredit;
  }
}

function validateJournalLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('القيد يجب أن يحتوي على سطرين على الأقل');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (debit > 0 && credit > 0) {
      throw new Error('السطر الواحد لا يمكن أن يحتوي مدين ودائن معًا');
    }
    if (debit < 0 || credit < 0) {
      throw new Error('لا يمكن أن تكون القيمة سالبة');
    }
    totalDebit += debit;
    totalCredit += credit;
  }

  const diff = Math.round((totalDebit - totalCredit) * 100);
  if (diff !== 0) {
    throw new UnbalancedEntryError(totalDebit.toFixed(2), totalCredit.toFixed(2));
  }
}

/**
 * يرحّل قيد محاسبي داخل transaction موجود (client).
 */
async function postJournalEntryWithClient(client, {
  tenantId,
  userId,
  sourceType,
  sourceRefId,
  memo,
  lines,
  idempotencyKey,
  currencyId = null,
  exchangeRate = 1,
  entryDate = null,
  reconcileFx = true,
}) {
  validateJournalLines(lines);

  const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
  const day = entryDate && /^\d{4}-\d{2}-\d{2}$/.test(String(entryDate).slice(0, 10))
    ? String(entryDate).slice(0, 10)
    : null;

  const entryNumber = await nextDocumentNumber(client, tenantId, sourceType);

  const entryResult = await client.query(
    `INSERT INTO journal_entries
       (tenant_id, source_type, source_ref_id, memo, created_by, currency_id, exchange_rate, entry_date, entry_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE), $9)
     RETURNING id, entry_number`,
    [tenantId, sourceType, sourceRefId || null, memo || null, userId, currencyId, rate, day, entryNumber]
  );
  const journalEntryId = entryResult.rows[0].id;
  const assignedNumber = entryResult.rows[0].entry_number || entryNumber || null;

  for (const line of lines) {
    await client.query(
      `INSERT INTO journal_entry_lines
         (tenant_id, journal_entry_id, account_id, debit, credit, line_memo,
          currency_id, exchange_rate, foreign_debit, foreign_credit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId,
        journalEntryId,
        line.accountId,
        line.debit || 0,
        line.credit || 0,
        line.lineMemo || null,
        line.currencyId || null,
        line.exchangeRate != null ? Number(line.exchangeRate) : 1,
        line.foreignDebit || 0,
        line.foreignCredit || 0,
      ]
    );
  }

  if (idempotencyKey) {
    await client.query(
      `INSERT INTO idempotency_keys (key, tenant_id, journal_entry_id) VALUES ($1, $2, $3)`,
      [idempotencyKey, tenantId, journalEntryId]
    );
  }

  let fxAdjustments = [];
  if (reconcileFx && sourceType !== FX_SOURCE_TYPE) {
    fxAdjustments = await reconcileAfterJournalEntry(client, {
      tenantId,
      userId,
      journalEntryId,
      lines,
      sourceType,
      entryDate: day,
    });
  }

  return { journalEntryId, entryNumber: assignedNumber, fxAdjustments };
}

/**
 * يرحّل قيد محاسبي كامل (رأس + أسطر) بشكل ذري (atomic).
 */
async function postJournalEntry({
  tenantId,
  userId,
  sourceType,
  sourceRefId,
  memo,
  lines,
  idempotencyKey,
  currencyId = null,
  exchangeRate = 1,
  entryDate = null,
  reconcileFx = true,
}) {
  if (!tenantId) {
    throw new Error('postJournalEntry requires tenantId');
  }
  if (!userId) {
    throw new Error('postJournalEntry requires userId');
  }

  if (idempotencyKey) {
    const existing = await withTenantClient(tenantId, async (client) => {
      const result = await client.query(
        `SELECT ik.journal_entry_id, je.entry_number
         FROM idempotency_keys ik
         JOIN journal_entries je ON je.id = ik.journal_entry_id AND je.tenant_id = ik.tenant_id
         WHERE ik.key = $1 AND ik.tenant_id = $2`,
        [idempotencyKey, tenantId]
      );
      return result.rows[0] || null;
    });
    if (existing?.journal_entry_id) {
      return {
        journalEntryId: existing.journal_entry_id,
        entryNumber: existing.entry_number || null,
        deduplicated: true,
        fxAdjustments: [],
      };
    }
  }

  validateJournalLines(lines);

  const day = entryDate && /^\d{4}-\d{2}-\d{2}$/.test(String(entryDate).slice(0, 10))
    ? String(entryDate).slice(0, 10)
    : null;

  await assertEntryDateAllowed(tenantId, day || new Date().toISOString().slice(0, 10));

  return withTenantClient(tenantId, async (client) => postJournalEntryWithClient(client, {
    tenantId,
    userId,
    sourceType,
    sourceRefId,
    memo,
    lines,
    idempotencyKey,
    currencyId,
    exchangeRate,
    entryDate: day,
    reconcileFx,
  }));
}

/**
 * يلغي قيد سابق بقيد عكسي جديد — بدل ما يعدّل أو يحذف القيد
 * الأصلي (يلي ممنوع أصلاً حسب تصميم الـ schema).
 */
async function reverseJournalEntry({ tenantId, userId, originalEntryId, memo }) {
  return withTenantClient(tenantId, async (client) => {
    const linesResult = await client.query(
      `SELECT account_id, debit, credit, foreign_debit, foreign_credit, currency_id, exchange_rate
       FROM journal_entry_lines
       WHERE journal_entry_id = $1 AND tenant_id = $2`,
      [originalEntryId, tenantId]
    );
    if (linesResult.rows.length === 0) {
      throw new Error('القيد الأصلي غير موجود');
    }

    const original = await client.query(
      `SELECT entry_date FROM journal_entries WHERE id = $1 AND tenant_id = $2`,
      [originalEntryId, tenantId]
    );
    const originalDay = original.rows[0]?.entry_date
      ? String(original.rows[0].entry_date).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    await assertEntryDateAllowed(tenantId, originalDay, client);

    const reversedLines = linesResult.rows.map((row) => ({
      accountId: row.account_id,
      debit: row.credit,
      credit: row.debit,
      foreignDebit: Number(row.foreign_credit) || 0,
      foreignCredit: Number(row.foreign_debit) || 0,
      currencyId: row.currency_id || null,
      exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : 1,
    }));

    const result = await postJournalEntryWithClient(client, {
      tenantId,
      userId,
      sourceType: 'REVERSAL',
      sourceRefId: originalEntryId,
      memo: memo || 'قيد عكسي لتصحيح',
      lines: reversedLines,
      entryDate: originalDay,
      reconcileFx: true,
    });

    await client.query(
      `UPDATE journal_entries SET reversed_by = $1 WHERE id = $2 AND tenant_id = $3`,
      [result.journalEntryId, originalEntryId, tenantId]
    );

    return { reversalEntryId: result.journalEntryId, fxAdjustments: result.fxAdjustments || [] };
  });
}

/**
 * يحسب الرصيد الحالي لحساب معيّن من القيود مباشرة (مصدر الحقيقة
 * الوحيد — لا يوجد عمود balance مخزّن يمكن يتعارض مع الحركات).
 */
async function getAccountBalance({ tenantId, accountId }) {
  return withTenantClient(tenantId, async (client) => {
    const result = await client.query(
      `SELECT COALESCE(SUM(debit), 0) AS total_debit,
              COALESCE(SUM(credit), 0) AS total_credit
       FROM journal_entry_lines
       WHERE account_id = $1 AND tenant_id = $2`,
      [accountId, tenantId]
    );
    const { total_debit, total_credit } = result.rows[0];
    return Number(total_debit) - Number(total_credit);
  });
}

module.exports = {
  postJournalEntry,
  postJournalEntryWithClient,
  reverseJournalEntry,
  getAccountBalance,
  UnbalancedEntryError,
  ClosedFiscalYearError,
};
