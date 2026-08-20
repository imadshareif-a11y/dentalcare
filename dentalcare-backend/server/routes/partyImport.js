const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const { requireAuth, requireRole, requireClinicContext } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { nextAccountCode, ensureBroughtForwardAccount } = require('../settings/numbering');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } });

function cell(row, ...keys) {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  return '';
}

function parseRows(buffer, preferredSheet) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames.includes(preferredSheet)
    ? preferredSheet
    : workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
}

function sendWorkbook(res, filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

router.get('/settings/excel-template/patients', requireAuth, requireClinicContext, requireRole(['OWNER']), (req, res) => {
  sendWorkbook(res, 'patients-import.xlsx', [
    ['الذمم_المدينة', [
      ['الاسم', 'الهاتف', 'العنوان', 'ملاحظات_طبية', 'الرصيد'],
      ['أحمد علي', '0591234567', 'رام الله', 'حساسية بنج', 350],
      ['سارة خالد', '0569876543', '', '', 0],
    ]],
    ['شرح', [
      ['العمود', 'معناه'],
      ['الاسم', 'اسم الزبون/المريض — مطلوب'],
      ['الهاتف', 'رقم الهاتف — اختياري'],
      ['العنوان', 'اختياري'],
      ['ملاحظات_طبية', 'اختياري'],
      ['الرصيد', 'كم باقي عليه للعيادة. بيتسجل رصيد مدور. اترك 0 إذا ما عليه شي'],
      ['', 'رقم الحساب بيتولد تلقائي من إعدادات الترقيم'],
      ['', 'حسابات الصندوق والبنك ورأس المال ما تتحط هون — المحاسب بدخلها بقيود'],
    ]],
  ]);
});

router.get('/settings/excel-template/suppliers', requireAuth, requireClinicContext, requireRole(['OWNER']), (req, res) => {
  sendWorkbook(res, 'suppliers-import.xlsx', [
    ['الذمم_الدائنة', [
      ['الاسم', 'الهاتف', 'الرصيد'],
      ['مختبر الأسنان', '022234567', 1200],
      ['شركة المواد', '0590001112', 0],
    ]],
    ['شرح', [
      ['العمود', 'معناه'],
      ['الاسم', 'اسم المورد — مطلوب'],
      ['الهاتف', 'اختياري'],
      ['الرصيد', 'كم العيادة مديونة له. بيتسجل رصيد مدور'],
      ['', 'رقم الحساب بيتولد تلقائي'],
    ]],
  ]);
});

router.post(
  '/settings/import-patients',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ارفع ملف Excel للذمم المدينة' });
    let rows;
    try {
      rows = parseRows(req.file.buffer, 'الذمم_المدينة');
    } catch {
      return res.status(400).json({ error: 'تعذّر قراءة الملف. نزّل النموذج الجاهز أولاً' });
    }
    if (!rows.length) return res.status(400).json({ error: 'الملف فارغ' });

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const broughtForwardId = await ensureBroughtForwardAccount(client, req.user.tenantId);
        const created = [];
        const openingLines = [];
        for (let i = 0; i < rows.length; i += 1) {
          const raw = rows[i];
          const name = cell(raw, 'الاسم', 'name', 'Name');
          if (!name) continue;
          const phone = cell(raw, 'الهاتف', 'phone') || null;
          const address = cell(raw, 'العنوان', 'address') || null;
          const medicalNotes = cell(raw, 'ملاحظات_طبية', 'ملاحظات طبية', 'medical_notes') || null;
          const balance = Number(cell(raw, 'الرصيد', 'balance') || 0) || 0;
          if (balance < 0) {
            throw Object.assign(new Error(`سطر ${i + 2}: الرصيد لا يكون سالب`), { statusCode: 400 });
          }

          const accountCode = await nextAccountCode(client, req.user.tenantId, 'patients');
          const account = await client.query(
            `INSERT INTO chart_of_accounts
               (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
             VALUES ($1, $2, $3, $3, $4, $5, 'RECEIVABLE')
             RETURNING id`,
            [req.user.tenantId, accountCode, `ذمة: ${name}`, `Balance: ${name}`, `יתרת: ${name}`]
          );
          const accountId = account.rows[0].id;
          await client.query(
            `INSERT INTO parties (tenant_id, party_type, name, phone, address, medical_notes, account_id)
             VALUES ($1, 'PATIENT', $2, $3, $4, $5, $6)`,
            [req.user.tenantId, name, phone, address, medicalNotes, accountId]
          );
          created.push({ name, accountCode, balance });
          if (balance > 0) {
            openingLines.push({ accountId, debit: balance, credit: 0, lineMemo: `رصيد مدور — ${name}` });
          }
        }
        return { created, openingLines, broughtForwardId };
      });

      let journalEntryId = null;
      if (result.openingLines.length > 0) {
        const total = result.openingLines.reduce((sum, l) => sum + l.debit, 0);
        const posted = await postJournalEntry({
          tenantId: req.user.tenantId,
          userId: req.user.userId,
          sourceType: 'OPENING',
          memo: 'أرصدة مدورة — ذمم مدينة',
          lines: [
            ...result.openingLines,
            { accountId: result.broughtForwardId, credit: total, lineMemo: 'مقابل أرصدة الزبائن المدورة' },
          ],
        });
        journalEntryId = posted.journalEntryId;
      }

      res.json({
        success: true,
        created: result.created.length,
        withBalance: result.openingLines.length,
        journalEntryId,
      });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err instanceof UnbalancedEntryError) return res.status(400).json({ error: err.message });
      console.error('Import patients failed:', err);
      res.status(500).json({ error: 'تعذّر استيراد الذمم المدينة' });
    }
  }
);

router.post(
  '/settings/import-suppliers',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'ارفع ملف Excel للذمم الدائنة' });
    let rows;
    try {
      rows = parseRows(req.file.buffer, 'الذمم_الدائنة');
    } catch {
      return res.status(400).json({ error: 'تعذّر قراءة الملف. نزّل النموذج الجاهز أولاً' });
    }
    if (!rows.length) return res.status(400).json({ error: 'الملف فارغ' });

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const broughtForwardId = await ensureBroughtForwardAccount(client, req.user.tenantId);
        const created = [];
        const openingLines = [];
        for (let i = 0; i < rows.length; i += 1) {
          const raw = rows[i];
          const name = cell(raw, 'الاسم', 'name', 'Name');
          if (!name) continue;
          const phone = cell(raw, 'الهاتف', 'phone') || null;
          const balance = Number(cell(raw, 'الرصيد', 'balance') || 0) || 0;
          if (balance < 0) {
            throw Object.assign(new Error(`سطر ${i + 2}: الرصيد لا يكون سالب`), { statusCode: 400 });
          }

          const accountCode = await nextAccountCode(client, req.user.tenantId, 'suppliers');
          const account = await client.query(
            `INSERT INTO chart_of_accounts
               (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
             VALUES ($1, $2, $3, $3, $4, $5, 'LIABILITY')
             RETURNING id`,
            [req.user.tenantId, accountCode, `مورد: ${name}`, `Supplier: ${name}`, `ספק: ${name}`]
          );
          const accountId = account.rows[0].id;
          await client.query(
            `INSERT INTO parties (tenant_id, party_type, name, phone, account_id)
             VALUES ($1, 'SUPPLIER', $2, $3, $4)`,
            [req.user.tenantId, name, phone, accountId]
          );
          created.push({ name, accountCode, balance });
          if (balance > 0) {
            openingLines.push({ accountId, credit: balance, debit: 0, lineMemo: `رصيد مدور — ${name}` });
          }
        }
        return { created, openingLines, broughtForwardId };
      });

      let journalEntryId = null;
      if (result.openingLines.length > 0) {
        const total = result.openingLines.reduce((sum, l) => sum + l.credit, 0);
        const posted = await postJournalEntry({
          tenantId: req.user.tenantId,
          userId: req.user.userId,
          sourceType: 'OPENING',
          memo: 'أرصدة مدورة — ذمم دائنة',
          lines: [
            { accountId: result.broughtForwardId, debit: total, lineMemo: 'مقابل أرصدة الموردين المدورة' },
            ...result.openingLines,
          ],
        });
        journalEntryId = posted.journalEntryId;
      }

      res.json({
        success: true,
        created: result.created.length,
        withBalance: result.openingLines.length,
        journalEntryId,
      });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err instanceof UnbalancedEntryError) return res.status(400).json({ error: err.message });
      console.error('Import suppliers failed:', err);
      res.status(500).json({ error: 'تعذّر استيراد الذمم الدائنة' });
    }
  }
);

module.exports = router;
