// routes/checks.js
// دورة حياة الشيك الوارد:
// CHECKS_BOX (صندوق الشيكات) → إيداع بقيد بنكي → BANK_COLLECTION (برسم التحصيل)
// → تحصيل → BANK_CURRENT (حساب جاري نقدي)

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, reverseJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ALLOWED_CHECK_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

router.get(
  '/checks',
  requireAuth,
  requireAnyPermission([['checks', 'view'], ['payments', 'edit']]),
  async (req, res) => {
  const { status, location } = req.query;

  try {
    const checks = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT c.id, c.check_number, c.bank_name, c.bank_number, c.due_date, c.drawer_name,
                c.status, c.amount, c.check_type, c.location,
                c.holding_account_id, c.location_account_id, c.collection_bank_account_id,
                (c.image_front_bytes IS NOT NULL) AS has_front_image,
                (c.image_back_bytes IS NOT NULL) AS has_back_image,
                loc.account_code AS location_account_code,
                loc.account_name_ar AS location_account_name_ar,
                loc.account_name_en AS location_account_name_en,
                loc.account_name_he AS location_account_name_he,
                hold.account_code AS holding_account_code,
                hold.account_name_ar AS holding_account_name_ar,
                cb.id AS cash_box_id, cb.name AS cash_box_name, cb.box_kind AS cash_box_kind,
                ba.id AS bank_account_row_id, ba.name AS bank_account_name,
                ba.account_kind AS bank_account_kind, ba.account_number AS bank_account_number,
                b.bank_number AS linked_bank_number, b.name AS linked_bank_name,
                issuer.bank_number AS issuer_bank_number,
                issuer.name AS issuer_bank_name,
                issuer.name_en AS issuer_bank_name_en,
                issuer.name_he AS issuer_bank_name_he
         FROM checks c
         LEFT JOIN chart_of_accounts loc ON loc.id = COALESCE(c.location_account_id, c.holding_account_id)
         LEFT JOIN chart_of_accounts hold ON hold.id = c.holding_account_id
         LEFT JOIN cash_boxes cb
           ON cb.account_id = COALESCE(c.location_account_id, c.holding_account_id)
          AND COALESCE(c.location, 'CHECKS_BOX') = 'CHECKS_BOX'
         LEFT JOIN bank_accounts ba
           ON ba.id = c.collection_bank_account_id
           OR (
             c.collection_bank_account_id IS NULL
             AND ba.chart_account_id = COALESCE(c.location_account_id, c.holding_account_id)
             AND COALESCE(c.location, 'CHECKS_BOX') IN ('BANK_COLLECTION', 'BANK_CURRENT')
           )
         LEFT JOIN banks b ON b.id = ba.bank_id
         LEFT JOIN banks issuer
           ON c.bank_number IS NOT NULL
          AND TRIM(issuer.bank_number) = TRIM(c.bank_number)
         WHERE ($1::VARCHAR IS NULL OR c.status = $1)
           AND ($2::VARCHAR IS NULL OR c.location = $2)
           AND c.tenant_id = $3
         ORDER BY c.due_date ASC`,
        [status || null, location || null, req.user.tenantId]
      );
      return result.rows.map((row) => ({
        id: row.id,
        check_number: row.check_number,
        bank_name: row.bank_name,
        bank_number: row.bank_number,
        issuer_bank_name: row.issuer_bank_name,
        issuer_bank_name_en: row.issuer_bank_name_en,
        issuer_bank_name_he: row.issuer_bank_name_he,
        due_date: row.due_date,
        drawer_name: row.drawer_name,
        status: row.status,
        amount: row.amount,
        check_type: row.check_type,
        location: row.location || 'CHECKS_BOX',
        location_account_id: row.location_account_id || row.holding_account_id,
        location_account_code: row.location_account_code,
        location_account_name: row.location_account_name_ar || row.location_account_code,
        location_account_name_en: row.location_account_name_en,
        location_account_name_he: row.location_account_name_he,
        holding_account_code: row.holding_account_code,
        holding_account_name: row.holding_account_name_ar,
        cash_box_id: row.cash_box_id,
        cash_box_name: row.cash_box_name,
        cash_box_kind: row.cash_box_kind,
        bank_account_id: row.bank_account_row_id || row.collection_bank_account_id,
        bank_account_name: row.bank_account_name,
        bank_account_kind: row.bank_account_kind,
        bank_account_number: row.bank_account_number,
        linked_bank_number: row.linked_bank_number,
        linked_bank_name: row.linked_bank_name,
        has_front_image: Boolean(row.has_front_image),
        has_back_image: Boolean(row.has_back_image),
      }));
    });
    res.json(checks);
  } catch (err) {
    console.error('Fetching checks failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الشيكات' });
  }
});

async function loadJournalBundle(client, entryId) {
  if (!entryId) return null;
  const entryResult = await client.query(
    `SELECT id, source_type, memo,
            to_char(COALESCE(entry_date, (created_at AT TIME ZONE 'UTC')::date), 'YYYY-MM-DD') AS entry_date,
            created_at
     FROM journal_entries WHERE id = $1
       AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
    [entryId]
  );
  if (entryResult.rowCount === 0) return null;
  const entry = entryResult.rows[0];
  const linesResult = await client.query(
    `SELECT l.debit, l.credit, l.line_memo,
            a.id AS account_id, a.account_code,
            a.account_name_ar, a.account_name_en, a.account_name_he,
            p.name AS party_name, p.party_type,
            cb.name AS cash_box_name, cb.box_kind AS cash_box_kind,
            ba.name AS bank_account_name, ba.account_kind AS bank_account_kind
     FROM journal_entry_lines l
     JOIN chart_of_accounts a ON a.id = l.account_id
       AND a.tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
     LEFT JOIN parties p ON p.account_id = a.id AND p.tenant_id = a.tenant_id
     LEFT JOIN cash_boxes cb ON cb.account_id = a.id AND cb.tenant_id = a.tenant_id
     LEFT JOIN bank_accounts ba ON ba.chart_account_id = a.id AND ba.tenant_id = a.tenant_id
     WHERE l.journal_entry_id = $1
       AND l.tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
     ORDER BY l.debit DESC, l.credit DESC`,
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
    cashBoxName: row.cash_box_name || null,
    cashBoxKind: row.cash_box_kind || null,
    bankAccountName: row.bank_account_name || null,
    bankAccountKind: row.bank_account_kind || null,
  }));
  return {
    id: entry.id,
    sourceType: entry.source_type,
    memo: entry.memo,
    date: entry.entry_date,
    createdAt: entry.created_at,
    lines,
  };
}

function partyFromLines(lines, side) {
  const match = (lines || []).find((l) => (
    side === 'debit' ? l.debit > 0 : l.credit > 0
  ) && l.partyName);
  return match ? { name: match.partyName, type: match.partyType, accountName: match.accountName } : null;
}

function placeFromLines(lines, side) {
  const candidates = (lines || []).filter((l) => (side === 'debit' ? l.debit > 0 : l.credit > 0));
  for (const l of candidates) {
    if (l.cashBoxName) return { kind: 'box', name: l.cashBoxName };
    if (l.bankAccountName) {
      return {
        kind: l.bankAccountKind === 'COLLECTION' ? 'collection' : 'bank',
        name: l.bankAccountName,
      };
    }
  }
  const first = candidates[0];
  if (first) return { kind: 'account', name: first.accountName };
  return null;
}

router.get(
  '/checks/:id/lifecycle',
  requireAuth,
  requirePermission('checks', 'view'),
  async (req, res) => {
    try {
      const data = await withTenantClient(req.user.tenantId, async (client) => {
        const checkResult = await client.query(
          `SELECT c.id, c.check_number, c.bank_name, c.bank_number, c.due_date, c.drawer_name,
                  c.amount, c.status, c.check_type, c.location,
                  c.journal_entry_id, c.deposited_journal_entry_id,
                  c.cleared_journal_entry_id, c.endorsed_journal_entry_id,
                  c.holding_account_id, c.location_account_id, c.collection_bank_account_id,
                  (c.image_front_bytes IS NOT NULL) AS has_front_image,
                  (c.image_back_bytes IS NOT NULL) AS has_back_image,
                  hold.account_name_ar AS holding_name,
                  loc.account_name_ar AS location_name,
                  cb.name AS cash_box_name,
                  ba.name AS bank_account_name, ba.account_kind AS bank_account_kind,
                  issuer.name AS issuer_bank_name,
                  issuer.name_en AS issuer_bank_name_en,
                  issuer.name_he AS issuer_bank_name_he
           FROM checks c
           LEFT JOIN chart_of_accounts hold ON hold.id = c.holding_account_id
           LEFT JOIN chart_of_accounts loc ON loc.id = COALESCE(c.location_account_id, c.holding_account_id)
           LEFT JOIN cash_boxes cb
             ON cb.account_id = COALESCE(c.location_account_id, c.holding_account_id)
            AND COALESCE(c.location, 'CHECKS_BOX') = 'CHECKS_BOX'
           LEFT JOIN bank_accounts ba
             ON ba.id = c.collection_bank_account_id
             OR (
               c.collection_bank_account_id IS NULL
               AND ba.chart_account_id = COALESCE(c.location_account_id, c.holding_account_id)
             )
           LEFT JOIN banks issuer
             ON c.bank_number IS NOT NULL
            AND TRIM(issuer.bank_number) = TRIM(c.bank_number)
           WHERE c.id = $1 AND c.tenant_id = $2`,
          [req.params.id, req.user.tenantId]
        );
        if (checkResult.rowCount === 0) return null;
        const check = checkResult.rows[0];

        let bounceEntryId = null;
        if (check.status === 'BOUNCED' && check.journal_entry_id) {
          const bounce = await client.query(
            `SELECT id FROM journal_entries
             WHERE source_type = 'REVERSAL' AND source_ref_id = $1
               AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
             ORDER BY created_at DESC LIMIT 1`,
            [check.journal_entry_id]
          );
          bounceEntryId = bounce.rows[0]?.id || null;
        }

        const origin = await loadJournalBundle(client, check.journal_entry_id);
        const deposited = await loadJournalBundle(client, check.deposited_journal_entry_id);
        const cleared = await loadJournalBundle(client, check.cleared_journal_entry_id);
        const endorsed = await loadJournalBundle(client, check.endorsed_journal_entry_id);
        const bounced = await loadJournalBundle(client, bounceEntryId);

        const timeline = [];

        if (origin) {
          const isReceived = check.check_type === 'RECEIVED';
          const fromParty = isReceived
            ? partyFromLines(origin.lines, 'credit')
            : null;
          const toParty = !isReceived
            ? partyFromLines(origin.lines, 'debit')
            : null;
          const place = isReceived
            ? placeFromLines(origin.lines, 'debit')
            : placeFromLines(origin.lines, 'credit');
          timeline.push({
            type: isReceived ? 'RECEIVED' : 'ISSUED',
            date: origin.date,
            memo: origin.memo,
            journalEntryId: origin.id,
            from: fromParty || (check.drawer_name ? { name: check.drawer_name, type: 'DRAWER' } : null),
            to: toParty,
            place,
            lines: origin.lines,
          });
        }

        if (deposited) {
          timeline.push({
            type: 'DEPOSITED',
            date: deposited.date,
            memo: deposited.memo,
            journalEntryId: deposited.id,
            from: placeFromLines(deposited.lines, 'credit'),
            to: placeFromLines(deposited.lines, 'debit'),
            place: placeFromLines(deposited.lines, 'debit'),
            lines: deposited.lines,
          });
        }

        if (cleared) {
          const isReceived = check.check_type === 'RECEIVED';
          timeline.push({
            type: 'CLEARED',
            date: cleared.date,
            memo: cleared.memo,
            journalEntryId: cleared.id,
            from: placeFromLines(cleared.lines, isReceived ? 'credit' : 'debit'),
            to: placeFromLines(cleared.lines, isReceived ? 'debit' : 'credit'),
            place: placeFromLines(cleared.lines, isReceived ? 'debit' : 'credit'),
            lines: cleared.lines,
          });
        }

        if (endorsed) {
          timeline.push({
            type: 'ENDORSED',
            date: endorsed.date,
            memo: endorsed.memo,
            journalEntryId: endorsed.id,
            from: placeFromLines(endorsed.lines, 'credit'),
            to: partyFromLines(endorsed.lines, 'debit'),
            place: null,
            lines: endorsed.lines,
          });
        }

        if (bounced) {
          timeline.push({
            type: 'BOUNCED',
            date: bounced.date,
            memo: bounced.memo,
            journalEntryId: bounced.id,
            from: null,
            to: partyFromLines(bounced.lines, 'debit') || partyFromLines(bounced.lines, 'credit'),
            place: null,
            lines: bounced.lines,
          });
        }

        timeline.sort((a, b) => String(a.date).localeCompare(String(b.date)));

        let currentPlace = null;
        if (check.location === 'CHECKS_BOX') {
          currentPlace = { kind: 'box', name: check.cash_box_name || check.holding_name || check.location_name };
        } else if (check.location === 'BANK_COLLECTION') {
          currentPlace = { kind: 'collection', name: check.bank_account_name || check.location_name };
        } else if (check.location === 'BANK_CURRENT') {
          currentPlace = { kind: 'bank', name: check.bank_account_name || check.location_name };
        } else if (check.location === 'ENDORSED') {
          const last = timeline.find((e) => e.type === 'ENDORSED');
          currentPlace = { kind: 'endorsed', name: last?.to?.name || null };
        } else if (check.location === 'BOUNCED') {
          currentPlace = { kind: 'bounced', name: null };
        }

        return {
          check: {
            id: check.id,
            checkNumber: check.check_number,
            bankName: check.bank_name,
            bankNumber: check.bank_number,
            issuerBankName: check.issuer_bank_name,
            issuerBankNameEn: check.issuer_bank_name_en,
            issuerBankNameHe: check.issuer_bank_name_he,
            dueDate: check.due_date,
            drawerName: check.drawer_name,
            amount: Number(check.amount),
            status: check.status,
            checkType: check.check_type,
            location: check.location || 'CHECKS_BOX',
            hasFrontImage: Boolean(check.has_front_image),
            hasBackImage: Boolean(check.has_back_image),
          },
          currentPlace,
          timeline,
        };
      });

      if (!data) return res.status(404).json({ error: 'الشيك غير موجود' });
      res.json(data);
    } catch (err) {
      console.error('Check lifecycle failed:', err);
      res.status(500).json({ error: 'تعذّر جلب دورة حياة الشيك' });
    }
  }
);

// تحصيل شيك مودع برسم التحصيل → الحساب الجاري النقدي
router.post(
  '/checks/:id/clear',
  requireAuth,
  requirePermission('checks', 'edit'),
  async (req, res) => {
    const { id } = req.params;
    const { bankAccountId } = req.body; // bank_accounts.id من نوع CURRENT

    if (!bankAccountId) {
      return res.status(400).json({ error: 'يجب تحديد الحساب الجاري البنكي للتحصيل' });
    }

    try {
      const ctx = await withTenantClient(req.user.tenantId, async (client) => {
        const checkResult = await client.query(
          `SELECT id, amount, holding_account_id, location_account_id, location, status, check_type
           FROM checks WHERE id = $1 AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
          [id]
        );
        const check = checkResult.rows[0] || null;
        if (!check) return { error: 'الشيك غير موجود', status: 404 };

        if (check.check_type === 'RECEIVED') {
          if (check.location !== 'BANK_COLLECTION' || !['PENDING', 'DEPOSITED'].includes(check.status)) {
            return {
              error: 'إيداع الشيك في حساب برسم التحصيل يتم من القيد البنكي أولًا، ثم التحصيل للحساب الجاري',
              status: 400,
            };
          }
        } else if (check.status !== 'PENDING' || check.location !== 'CHECKS_BOX') {
          return { error: 'هذا الشيك ليس بانتظار الدفع/التحصيل', status: 400 };
        }

        const bankResult = await client.query(
          `SELECT id, chart_account_id, account_kind, name, is_active
           FROM bank_accounts WHERE id = $1 AND tenant_id = $2`,
          [bankAccountId, req.user.tenantId]
        );
        const bank = bankResult.rows[0];
        if (!bank || !bank.is_active) {
          return { error: 'الحساب البنكي غير موجود أو غير نشط', status: 400 };
        }
        if (check.check_type === 'RECEIVED' && bank.account_kind !== 'CURRENT') {
          return { error: 'التحصيل يجب أن يكون على حساب جاري (نقدي)', status: 400 };
        }

        return { check, bank };
      });

      if (ctx.error) return res.status(ctx.status).json({ error: ctx.error });

      const { check, bank } = ctx;
      const fromAccountId = check.location_account_id || check.holding_account_id;

      const lines = check.check_type === 'RECEIVED'
        ? [
            { accountId: bank.chart_account_id, debit: check.amount, lineMemo: 'تحصيل شيك' },
            { accountId: fromAccountId, credit: check.amount, lineMemo: 'من برسم التحصيل' },
          ]
        : [
            { accountId: fromAccountId, debit: check.amount, lineMemo: 'صرف شيك' },
            { accountId: bank.chart_account_id, credit: check.amount, lineMemo: 'من الحساب الجاري' },
          ];

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CHECK_CLEARING',
        sourceRefId: id,
        memo: check.check_type === 'RECEIVED' ? 'تحصيل شيك إلى الحساب الجاري' : 'صرف شيك من الحساب الجاري',
        lines,
      });

      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `UPDATE checks SET
             status = 'CLEARED',
             location = 'BANK_CURRENT',
             location_account_id = $1,
             cleared_journal_entry_id = $2
           WHERE id = $3 AND tenant_id = $4`,
          [bank.chart_account_id, journalEntryId, id, req.user.tenantId]
        );
      });

      res.json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Check clearing failed:', err);
      res.status(500).json({ error: 'تعذّر تحصيل الشيك' });
    }
  }
);

router.post(
  '/checks/:id/bounce',
  requireAuth,
  requirePermission('checks', 'edit'),
  async (req, res) => {
    const { id } = req.params;

    try {
      const check = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, journal_entry_id, status, location FROM checks WHERE id = $1 AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
          [id]
        );
        return result.rows[0] || null;
      });

      if (!check) return res.status(404).json({ error: 'الشيك غير موجود' });
      if (check.location !== 'CHECKS_BOX' || check.status !== 'PENDING') {
        return res.status(400).json({
          error: 'لا يمكن ارتجاع إلا شيك ما زال في صندوق الشيكات (قبل الإيداع)',
        });
      }

      const { reversalEntryId } = await reverseJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        originalEntryId: check.journal_entry_id,
        memo: 'ارتجاع شيك',
      });

      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `UPDATE checks SET status = 'BOUNCED', location = 'BOUNCED' WHERE id = $1 AND tenant_id = $2`,
          [id, req.user.tenantId]
        );
      });

      res.json({ success: true, reversalEntryId });
    } catch (err) {
      console.error('Check bounce failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل ارتجاع الشيك' });
    }
  }
);

router.post(
  '/checks/:id/endorse',
  requireAuth,
  requireAnyPermission([['checks', 'edit'], ['payments', 'edit']]),
  async (req, res) => {
    const { id } = req.params;
    const { payeeAccountId, date } = req.body;
    const entryDate = date ? String(date).slice(0, 10) : null;

    if (!payeeAccountId) {
      return res.status(400).json({ error: 'يجب تحديد حساب المستفيد (المورد)' });
    }

    try {
      const check = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, amount, holding_account_id, location_account_id, status, location, check_type
           FROM checks WHERE id = $1 AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
          [id]
        );
        return result.rows[0] || null;
      });

      if (!check) return res.status(404).json({ error: 'الشيك غير موجود' });
      if (check.location !== 'CHECKS_BOX' || check.status !== 'PENDING') {
        return res.status(400).json({ error: 'لا يمكن تظهير إلا شيك في صندوق الشيكات' });
      }
      if (check.check_type !== 'RECEIVED') {
        return res.status(400).json({ error: 'لا يمكن تظهير إلا شيك مقبوض من ذمة' });
      }

      const fromAccountId = check.location_account_id || check.holding_account_id;

      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CHECK_ENDORSEMENT',
        sourceRefId: id,
        memo: 'تظهير شيك لمورد',
        entryDate,
        lines: [
          { accountId: payeeAccountId, debit: check.amount },
          { accountId: fromAccountId, credit: check.amount },
        ],
      });

      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `UPDATE checks SET
             status = 'ENDORSED',
             location = 'ENDORSED',
             endorsed_journal_entry_id = $1
           WHERE id = $2 AND tenant_id = $3`,
          [journalEntryId, id, req.user.tenantId]
        );
      });

      res.json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Check endorsement failed:', err);
      res.status(500).json({ error: 'تعذّر تظهير الشيك' });
    }
  }
);

router.post(
  '/checks/:id/images',
  requireAuth,
  requireAnyPermission([['checks', 'edit'], ['receipts', 'edit'], ['payments', 'edit']]),
  imageUpload.fields([
    { name: 'front', maxCount: 1 },
    { name: 'back', maxCount: 1 },
  ]),
  async (req, res) => {
    const front = req.files?.front?.[0] || null;
    const back = req.files?.back?.[0] || null;
    if (!front && !back) {
      return res.status(400).json({ error: 'يجب إرفاق صورة للوجه أو الظهر على الأقل' });
    }
    for (const file of [front, back].filter(Boolean)) {
      if (!ALLOWED_CHECK_IMAGE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: 'صور الشيك يجب أن تكون JPG أو PNG أو WebP' });
      }
    }

    try {
      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const exists = await client.query(
          `SELECT id,
                  (image_front_bytes IS NOT NULL) AS has_front_image,
                  (image_back_bytes IS NOT NULL) AS has_back_image
           FROM checks WHERE id = $1 AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
          [req.params.id]
        );
        if (exists.rowCount === 0) return null;

        if (front) {
          await client.query(
            `UPDATE checks
             SET image_front_mime = $2, image_front_bytes = $3
             WHERE id = $1 AND tenant_id = $4`,
            [req.params.id, front.mimetype, front.buffer, req.user.tenantId]
          );
        }
        if (back) {
          await client.query(
            `UPDATE checks
             SET image_back_mime = $2, image_back_bytes = $3
             WHERE id = $1 AND tenant_id = $4`,
            [req.params.id, back.mimetype, back.buffer, req.user.tenantId]
          );
        }

        const result = await client.query(
          `SELECT id,
                  (image_front_bytes IS NOT NULL) AS has_front_image,
                  (image_back_bytes IS NOT NULL) AS has_back_image
           FROM checks WHERE id = $1 AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
          [req.params.id]
        );
        return result.rows[0];
      });

      if (!updated) return res.status(404).json({ error: 'الشيك غير موجود' });
      res.json({
        success: true,
        hasFrontImage: Boolean(updated.has_front_image),
        hasBackImage: Boolean(updated.has_back_image),
      });
    } catch (err) {
      console.error('Uploading check images failed:', err);
      res.status(500).json({ error: 'تعذّر رفع صور الشيك' });
    }
  }
);

async function sendCheckImage(req, res, side) {
  const mimeCol = side === 'front' ? 'image_front_mime' : 'image_back_mime';
  const bytesCol = side === 'front' ? 'image_front_bytes' : 'image_back_bytes';
  try {
    const file = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT ${mimeCol} AS mime, ${bytesCol} AS bytes FROM checks WHERE id = $1 AND tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid`,
        [req.params.id]
      );
      return result.rows[0] || null;
    });
    if (!file?.bytes) {
      return res.status(404).json({ error: side === 'front' ? 'لا توجد صورة لوجه الشيك' : 'لا توجد صورة لظهر الشيك' });
    }
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(file.bytes);
  } catch (err) {
    console.error(`Fetching check ${side} image failed:`, err);
    res.status(500).json({ error: 'تعذّر جلب صورة الشيك' });
  }
}

router.get(
  '/checks/:id/images/front',
  requireAuth,
  requireAnyPermission([['checks', 'view'], ['receipts', 'view'], ['payments', 'view']]),
  (req, res) => sendCheckImage(req, res, 'front')
);

router.get(
  '/checks/:id/images/back',
  requireAuth,
  requireAnyPermission([['checks', 'view'], ['receipts', 'view'], ['payments', 'view']]),
  (req, res) => sendCheckImage(req, res, 'back')
);

module.exports = router;
