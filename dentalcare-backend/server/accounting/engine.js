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

class UnbalancedEntryError extends Error {
  constructor(totalDebit, totalCredit) {
    super(`القيد غير متوازن: مجموع المدين ${totalDebit} لا يساوي مجموع الدائن ${totalCredit}`);
    this.name = 'UnbalancedEntryError';
    this.totalDebit = totalDebit;
    this.totalCredit = totalCredit;
  }
}

/**
 * يرحّل قيد محاسبي كامل (رأس + أسطر) بشكل ذري (atomic).
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.userId - من رحّل القيد (للـ audit trail)
 * @param {string} params.sourceType - RECEIPT | PAYMENT | JOURNAL | OPENING | CLINICAL_SESSION
 * @param {string} [params.sourceRefId] - ربط اختياري بمصدر العملية
 * @param {string} [params.memo]
 * @param {Array<{accountId: string, debit?: number, credit?: number, lineMemo?: string}>} params.lines
 *
 * @returns {Promise<{journalEntryId: string}>}
 * @throws {UnbalancedEntryError} لو مجموع المدين لا يساوي مجموع الدائن
 */
async function postJournalEntry({ tenantId, userId, sourceType, sourceRefId, memo, lines, idempotencyKey }) {
  // --- حماية من التكرار: نفس idempotencyKey ما بيترحّل مرتين ---
  // لو الواجهة أرسلت نفس الطلب مرتين (تأخر شبكة، ضغط مزدوج،
  // ريفريش)، نرجّع نفس النتيجة الأولى بدون ما نكرر الترحيل.
  if (idempotencyKey) {
    const existing = await withTenantClient(tenantId, async (client) => {
      const result = await client.query(
        `SELECT journal_entry_id FROM idempotency_keys WHERE key = $1`,
        [idempotencyKey]
      );
      return result.rows[0]?.journal_entry_id || null;
    });
    if (existing) {
      return { journalEntryId: existing, deduplicated: true };
    }
  }

  // --- الطبقة الأولى من الحماية: تحقق فوري بالتطبيق ---
  // بيدّي رسالة خطأ واضحة وسريعة قبل ما نلمس قاعدة البيانات أصلاً.
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

  // مقارنة بعد التقريب لتجنّب مشاكل الفاصلة العشرية (floating point)
  const diff = Math.round((totalDebit - totalCredit) * 100);
  if (diff !== 0) {
    throw new UnbalancedEntryError(totalDebit.toFixed(2), totalCredit.toFixed(2));
  }

  // --- الطبقة الثانية من الحماية: transaction + RLS + trigger ---
  // حتى لو في bug بالتحقق فوق (مثلاً عدّله AI بالمستقبل وكسره)،
  // الـ trigger بقاعدة البيانات (شوف sql/trigger_balance_check.sql)
  // رح يرفض أي قيد غير متوازن قبل ما ينترحل نهائيًا.
  return withTenantClient(tenantId, async (client) => {
    const entryResult = await client.query(
      `INSERT INTO journal_entries (tenant_id, source_type, source_ref_id, memo, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, sourceType, sourceRefId || null, memo || null, userId]
    );
    const journalEntryId = entryResult.rows[0].id;

    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_memo)
         VALUES ($1, $2, $3, $4, $5)`,
        [journalEntryId, line.accountId, line.debit || 0, line.credit || 0, line.lineMemo || null]
      );
    }

    if (idempotencyKey) {
      await client.query(
        `INSERT INTO idempotency_keys (key, tenant_id, journal_entry_id) VALUES ($1, $2, $3)`,
        [idempotencyKey, tenantId, journalEntryId]
      );
    }

    return { journalEntryId };
  });
}

/**
 * يلغي قيد سابق بقيد عكسي جديد — بدل ما يعدّل أو يحذف القيد
 * الأصلي (يلي ممنوع أصلاً حسب تصميم الـ schema).
 */
async function reverseJournalEntry({ tenantId, userId, originalEntryId, memo }) {
  return withTenantClient(tenantId, async (client) => {
    const linesResult = await client.query(
      `SELECT account_id, debit, credit FROM journal_entry_lines WHERE journal_entry_id = $1`,
      [originalEntryId]
    );
    if (linesResult.rows.length === 0) {
      throw new Error('القيد الأصلي غير موجود');
    }

    // نعكس كل سطر: المدين يصير دائن والعكس
    const reversedLines = linesResult.rows.map((row) => ({
      accountId: row.account_id,
      debit: row.credit,
      credit: row.debit,
    }));

    const entryResult = await client.query(
      `INSERT INTO journal_entries (tenant_id, source_type, source_ref_id, memo, created_by)
       VALUES ($1, 'REVERSAL', $2, $3, $4)
       RETURNING id`,
      [tenantId, originalEntryId, memo || 'قيد عكسي لتصحيح', userId]
    );
    const reversalId = entryResult.rows[0].id;

    for (const line of reversedLines) {
      await client.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4)`,
        [reversalId, line.accountId, line.debit, line.credit]
      );
    }

    await client.query(
      `UPDATE journal_entries SET reversed_by = $1 WHERE id = $2`,
      [reversalId, originalEntryId]
    );

    return { reversalEntryId: reversalId };
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
       WHERE account_id = $1`,
      [accountId]
    );
    const { total_debit, total_credit } = result.rows[0];
    return Number(total_debit) - Number(total_credit);
  });
}

module.exports = {
  postJournalEntry,
  reverseJournalEntry,
  getAccountBalance,
  UnbalancedEntryError,
};
