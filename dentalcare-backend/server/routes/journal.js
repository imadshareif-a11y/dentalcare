// routes/journal.js
// -----------------------------------------------------------
// يغطي حالتين طلبتهم بالمحادثة الأصلية:
// 1) قيد تسوية مفتوح الأطراف (من أي حساب/ذمة إلى أي حساب/ذمة)
// 2) قيد مركّب (Multi-Leg) بعدد غير محدود من الأسطر
// كلاهما نفس الشكل فعليًا — الفرق بس عدد الأسطر. القيد الافتتاحي
// حالة خاصة منفصلة تحت لأنها بتحتاج صلاحية أعلى (OWNER فقط).
// -----------------------------------------------------------

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveCurrencyContext, toBaseAmount } = require('../accounting/currency');

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const DOC_VIEW = requireAnyPermission([
  ['journal', 'view'],
  ['receipts', 'view'],
  ['payments', 'view'],
  ['reports', 'view'],
]);

const DOC_ATTACH = requireAnyPermission([
  ['journal', 'edit'],
  ['payments', 'edit'],
  ['receipts', 'edit'],
]);

const SOURCE_TYPES = new Set([
  'RECEIPT',
  'PAYMENT',
  'JOURNAL',
  'BANK_ENTRY',
  'PURCHASE_INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
]);

async function loadDocumentBundle(client, entryId) {
  if (!entryId) return null;
  const entryResult = await client.query(
    `SELECT je.id, je.source_type, je.source_ref_id, je.memo,
            to_char(COALESCE(je.entry_date, (je.created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS entry_date,
            je.created_at, je.exchange_rate,
            (je.attachment_bytes IS NOT NULL) AS has_attachment,
            je.attachment_mime,
            u.name AS created_by_name,
            c.code AS currency_code, c.symbol AS currency_symbol
     FROM journal_entries je
     LEFT JOIN users u ON u.id = je.created_by
     LEFT JOIN currencies c ON c.id = je.currency_id
     WHERE je.id = $1`,
    [entryId]
  );
  if (entryResult.rowCount === 0) return null;
  const entry = entryResult.rows[0];

  const linesResult = await client.query(
    `SELECT l.debit, l.credit, l.line_memo,
            a.id AS account_id, a.account_code,
            a.account_name_ar, a.account_name_en, a.account_name_he,
            p.name AS party_name, p.party_type
     FROM journal_entry_lines l
     JOIN chart_of_accounts a ON a.id = l.account_id
     LEFT JOIN parties p ON p.account_id = a.id
     WHERE l.journal_entry_id = $1
     ORDER BY l.debit DESC, l.credit DESC, a.account_code`,
    [entryId]
  );

  const checksResult = await client.query(
    `SELECT id, check_number, bank_name, bank_number, due_date, drawer_name, amount, check_type, status,
            (image_front_bytes IS NOT NULL) AS has_front_image,
            (image_back_bytes IS NOT NULL) AS has_back_image
     FROM checks
     WHERE journal_entry_id = $1
        OR deposited_journal_entry_id = $1
        OR cleared_journal_entry_id = $1
        OR endorsed_journal_entry_id = $1
     ORDER BY check_number`,
    [entryId]
  );

  const lines = linesResult.rows.map((row) => ({
    debit: Number(row.debit) || 0,
    credit: Number(row.credit) || 0,
    lineMemo: row.line_memo,
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name_ar || row.account_code,
    partyName: row.party_name || null,
    partyType: row.party_type || null,
  }));

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  return {
    id: entry.id,
    sourceType: entry.source_type,
    sourceRefId: entry.source_ref_id,
    memo: entry.memo,
    date: entry.entry_date,
    createdAt: entry.created_at,
    createdByName: entry.created_by_name || null,
    currencyCode: entry.currency_code || null,
    currencySymbol: entry.currency_symbol || null,
    exchangeRate: entry.exchange_rate != null ? Number(entry.exchange_rate) : null,
    hasAttachment: Boolean(entry.has_attachment),
    attachmentMime: entry.attachment_mime || null,
    totalDebit,
    totalCredit,
    lines,
    checks: checksResult.rows.map((c) => ({
      id: c.id,
      checkNumber: c.check_number,
      bankName: c.bank_name,
      bankNumber: c.bank_number,
      dueDate: c.due_date,
      drawerName: c.drawer_name,
      amount: Number(c.amount),
      checkType: c.check_type,
      status: c.status,
      hasFrontImage: Boolean(c.has_front_image),
      hasBackImage: Boolean(c.has_back_image),
    })),
  };
}

// يغطي كلا الحالتين: تسوية بسيطة (سطرين) أو قيد مركّب (أكثر من سطرين)
router.post(
  '/journal-entries',
  requireAuth,
  requirePermission('journal', 'edit'),
  async (req, res) => {
    const { lines, memo, currencyId } = req.body;

    if (!Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ error: 'القيد يجب أن يحتوي على سطرين على الأقل' });
    }

    for (const line of lines) {
      if (!line.accountId) {
        return res.status(400).json({ error: 'كل سطر يجب أن يحدد حساب' });
      }
    }

    let currency;
    try {
      currency = await resolveCurrencyContext(req.user.tenantId, currencyId || null);
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'JOURNAL',
        memo,
        currencyId: currency.currencyId,
        exchangeRate: currency.rate,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: toBaseAmount(Number(l.debit || 0), currency.rate),
          credit: toBaseAmount(Number(l.credit || 0), currency.rate),
          lineMemo: l.lineMemo,
        })),
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({
          error: err.message,
          totalDebit: err.totalDebit,
          totalCredit: err.totalCredit,
        });
      }
      console.error('Journal entry posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل القيد، يرجى المحاولة لاحقًا' });
    }
  }
);

// القيد الافتتاحي: صلاحية OWNER فقط — لأنه بيضبط أرصدة تأسيسية
// حساسة (رأس المال، أرصدة الذمم السابقة) وما بنبغى يصير اعتيادي
router.post(
  '/opening-balance',
  requireAuth,
  requirePermission('openingBalance', 'edit'),
  async (req, res) => {
    const { equityAccountId, lines, memo } = req.body;
    // lines هون = أرصدة الذمم الافتتاحية (كل واحدة مدين على حساب
    // الذمة)، وبيتوازن الكل بقيد دائن واحد على حساب رأس المال

    if (!equityAccountId || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'يجب تحديد حساب رأس المال وقائمة الأرصدة الافتتاحية' });
    }

    const totalOpeningBalances = lines.reduce((sum, l) => sum + Number(l.balance || 0), 0);
    if (totalOpeningBalances <= 0) {
      return res.status(400).json({ error: 'مجموع الأرصدة الافتتاحية يجب أن يكون أكبر من صفر' });
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'OPENING',
        memo: memo || 'قيد افتتاحي',
        lines: [
          ...lines.map((l) => ({
            accountId: l.accountId,
            debit: Number(l.balance),
            lineMemo: 'رصيد افتتاحي',
          })),
          { accountId: equityAccountId, credit: totalOpeningBalances },
        ],
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Opening balance posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل القيد الافتتاحي' });
    }
  }
);

router.get('/journal-entries', requireAuth, DOC_VIEW, async (req, res) => {
  const { sourceType, fromDate, toDate, limit } = req.query;
  if (!sourceType || !SOURCE_TYPES.has(String(sourceType))) {
    return res.status(400).json({ error: 'نوع المستند غير صالح' });
  }
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT je.id,
                to_char(COALESCE(je.entry_date, (je.created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS entry_date,
                je.memo, je.source_type, je.created_at,
                u.name AS created_by_name,
                COALESCE(SUM(l.debit), 0) AS total_debit,
                COALESCE(SUM(l.credit), 0) AS total_credit,
                (je.attachment_bytes IS NOT NULL) AS has_attachment,
                (
                  SELECT string_agg(DISTINCT p.name, '، ')
                  FROM journal_entry_lines lx
                  JOIN chart_of_accounts ax ON ax.id = lx.account_id
                  JOIN parties p ON p.account_id = ax.id
                  WHERE lx.journal_entry_id = je.id
                ) AS party_names
         FROM journal_entries je
         LEFT JOIN journal_entry_lines l ON l.journal_entry_id = je.id
         LEFT JOIN users u ON u.id = je.created_by
         WHERE je.source_type = $1
           AND ($2::DATE IS NULL OR COALESCE(je.entry_date, (je.created_at AT TIME ZONE 'UTC')::date) >= $2::DATE)
           AND ($3::DATE IS NULL OR COALESCE(je.entry_date, (je.created_at AT TIME ZONE 'UTC')::date) <= $3::DATE)
         GROUP BY je.id, u.name
         ORDER BY COALESCE(je.entry_date, (je.created_at AT TIME ZONE 'UTC')::date) DESC, je.created_at DESC
         LIMIT $4`,
        [sourceType, fromDate || null, toDate || null, take]
      );
      return result.rows.map((row) => ({
        id: row.id,
        date: row.entry_date,
        memo: row.memo,
        partyNames: row.party_names || null,
        summary: row.memo || row.party_names || null,
        sourceType: row.source_type,
        createdAt: row.created_at,
        createdByName: row.created_by_name || null,
        totalDebit: Number(row.total_debit),
        totalCredit: Number(row.total_credit),
        amount: Math.max(Number(row.total_debit), Number(row.total_credit)),
        hasAttachment: Boolean(row.has_attachment),
      }));
    });
    res.json(rows);
  } catch (err) {
    console.error('Listing journal documents failed:', err);
    res.status(500).json({ error: 'تعذّر جلب المستندات المرحلة' });
  }
});

router.get('/journal-entries/:id', requireAuth, DOC_VIEW, async (req, res) => {
  try {
    const doc = await withTenantClient(req.user.tenantId, async (client) => (
      loadDocumentBundle(client, req.params.id)
    ));
    if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
    res.json(doc);
  } catch (err) {
    console.error('Loading journal document failed:', err);
    res.status(500).json({ error: 'تعذّر جلب المستند' });
  }
});

router.post(
  '/journal-entries/:id/attachment',
  requireAuth,
  DOC_ATTACH,
  attachmentUpload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يجب اختيار صورة أو ملف PDF' });
    if (!ALLOWED_ATTACHMENT_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: 'المرفق يجب أن يكون صورة (JPG/PNG/WebP) أو PDF' });
    }
    try {
      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `UPDATE journal_entries
           SET attachment_mime = $2, attachment_bytes = $3
           WHERE id = $1
           RETURNING id, attachment_mime,
                     (attachment_bytes IS NOT NULL) AS has_attachment`,
          [req.params.id, req.file.mimetype, req.file.buffer]
        );
        return result.rows[0] || null;
      });
      if (!updated) return res.status(404).json({ error: 'المستند غير موجود' });
      res.json({
        success: true,
        hasAttachment: Boolean(updated.has_attachment),
        attachmentMime: updated.attachment_mime,
      });
    } catch (err) {
      console.error('Uploading journal attachment failed:', err);
      res.status(500).json({ error: 'تعذّر رفع مرفق المستند' });
    }
  }
);

router.get('/journal-entries/:id/attachment', requireAuth, DOC_VIEW, async (req, res) => {
  try {
    const file = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT attachment_mime, attachment_bytes FROM journal_entries WHERE id = $1`,
        [req.params.id]
      );
      return result.rows[0] || null;
    });
    if (!file?.attachment_bytes) {
      return res.status(404).json({ error: 'لا يوجد مرفق لهذا المستند' });
    }
    res.setHeader('Content-Type', file.attachment_mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(file.attachment_bytes);
  } catch (err) {
    console.error('Fetching journal attachment failed:', err);
    res.status(500).json({ error: 'تعذّر جلب مرفق المستند' });
  }
});

module.exports = router;
