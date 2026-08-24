// routes/banks.js
const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const {
  KIND_META,
  createBankAccount,
  ensureDefaultCurrentAccount,
} = require('../accounting/bankAccounts');
const {
  normalizeSerial,
  compareSerials,
  serialInRange,
  mapCheckbook,
  findAvailableCheckbook,
  countRemaining,
} = require('../accounting/checkbooks');

const LIST_ACCESS = requireAnyPermission([
  ['accounts', 'view'],
  ['receipts', 'edit'],
  ['payments', 'edit'],
  ['checks', 'view'],
  ['journal', 'edit'],
]);

function mapBank(row) {
  return {
    id: row.id,
    bank_number: row.bank_number,
    name: row.name,
    name_en: row.name_en,
    name_he: row.name_he,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

function mapBankAccount(row) {
  return {
    id: row.id,
    bank_id: row.bank_id,
    bank_number: row.bank_number,
    bank_name: row.bank_name,
    account_kind: row.account_kind,
    name: row.name,
    name_en: row.name_en,
    name_he: row.name_he,
    account_number: row.account_number,
    currency_id: row.currency_id,
    currency_code: row.currency_code,
    chart_account_id: row.chart_account_id,
    account_code: row.account_code,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

// ---------- كتالوج البنوك ----------

router.get('/banks', requireAuth, LIST_ACCESS, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM banks
         WHERE tenant_id = $1 ${includeInactive ? '' : 'AND is_active = TRUE'}
         ORDER BY bank_number ASC`,
        [req.user.tenantId]
      );
      return result.rows.map(mapBank);
    });
    res.json(rows);
  } catch (err) {
    console.error('Listing banks failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة البنوك' });
  }
});

router.post('/banks', requireAuth, requirePermission('accounts', 'edit'), async (req, res) => {
  const bankNumber = String(req.body.bankNumber || '').trim();
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

  if (!bankNumber) return res.status(400).json({ error: 'رقم البنك مطلوب' });
  if (!req.body.name || !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'اسم البنك مطلوب' });
  }

  try {
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      const { namesFromBody } = require('../i18n/localizeNames');
      const names = await namesFromBody(client, req.user.tenantId, req.body);
      const result = await client.query(
        `INSERT INTO banks (tenant_id, bank_number, name, name_en, name_he, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [req.user.tenantId, bankNumber, names.name, names.name_en, names.name_he, isActive]
      );
      return result.rows[0];
    });
    res.status(201).json({ success: true, id: row.id, bank: mapBank(row) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'رقم البنك مستخدم مسبقًا' });
    }
    console.error('Creating bank failed:', err);
    res.status(500).json({ error: 'تعذّر إضافة البنك' });
  }
});

router.patch('/banks/:id', requireAuth, requirePermission('accounts', 'edit'), async (req, res) => {
  try {
    await withTenantClient(req.user.tenantId, async (client) => {
      const existing = await client.query(`SELECT id FROM banks WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user.tenantId]);
      if (existing.rowCount === 0) {
        throw Object.assign(new Error('البنك غير موجود'), { statusCode: 404 });
      }

      const fields = [];
      const values = [req.params.id];
      const push = (col, val) => {
        values.push(val);
        fields.push(`${col} = $${values.length}`);
      };

      if (req.body.bankNumber !== undefined) {
        const n = String(req.body.bankNumber || '').trim();
        if (!n) throw Object.assign(new Error('رقم البنك مطلوب'), { statusCode: 400 });
        push('bank_number', n);
      }
      if (req.body.name !== undefined) {
        const n = String(req.body.name || '').trim();
        if (!n) throw Object.assign(new Error('اسم البنك مطلوب'), { statusCode: 400 });
        const { namesFromBody } = require('../i18n/localizeNames');
        const names = await namesFromBody(client, req.user.tenantId, req.body);
        push('name', names.name);
        push('name_en', names.name_en);
        push('name_he', names.name_he);
      }
      if (req.body.isActive !== undefined) push('is_active', Boolean(req.body.isActive));

      if (fields.length) {
        await client.query(`UPDATE banks SET ${fields.join(', ')} WHERE id = $1`, values);
      }
    });
    res.json({ success: true });
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'رقم البنك مستخدم مسبقًا' });
    }
    console.error('Updating bank failed:', err);
    res.status(500).json({ error: 'تعذّر تعديل البنك' });
  }
});

// ---------- الحسابات البنكية ----------

router.get('/bank-accounts', requireAuth, LIST_ACCESS, async (req, res) => {
  try {
    const kind = req.query.kind ? String(req.query.kind).toUpperCase() : null;
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';

    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      await ensureDefaultCurrentAccount(client, req.user.tenantId);

      const params = [req.user.tenantId];
      const where = ['ba.tenant_id = $1'];
      if (!includeInactive) where.push('ba.is_active = TRUE');
      if (kind && KIND_META[kind]) {
        params.push(kind);
        where.push(`ba.account_kind = $${params.length}`);
      }

      const result = await client.query(
        `SELECT ba.*,
                b.bank_number, b.name AS bank_name,
                c.code AS currency_code,
                a.account_code
         FROM bank_accounts ba
         LEFT JOIN banks b ON b.id = ba.bank_id
         LEFT JOIN currencies c ON c.id = ba.currency_id
         JOIN chart_of_accounts a ON a.id = ba.chart_account_id
         WHERE ${where.join(' AND ')}
         ORDER BY ba.account_kind ASC, a.account_code ASC`,
        params
      );
      return result.rows.map(mapBankAccount);
    });
    res.json(rows);
  } catch (err) {
    console.error('Listing bank accounts failed:', err);
    res.status(500).json({ error: 'تعذّر جلب الحسابات البنكية' });
  }
});

router.post('/bank-accounts', requireAuth, requirePermission('accounts', 'edit'), async (req, res) => {
  const accountKind = String(req.body.accountKind || '').toUpperCase();
  const accountNumber = (req.body.accountNumber || '').trim() || null;
  const bankId = req.body.bankId || null;
  const currencyId = req.body.currencyId || null;

  if (!KIND_META[accountKind]) {
    return res.status(400).json({ error: 'نوع الحساب البنكي غير صالح' });
  }
  if (!req.body.name || !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'اسم الحساب مطلوب' });
  }

  try {
    const id = await withTenantClient(req.user.tenantId, async (client) => {
      const { namesFromBody } = require('../i18n/localizeNames');
      const names = await namesFromBody(client, req.user.tenantId, req.body);
      if (bankId) {
        const bank = await client.query(
          `SELECT id FROM banks WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
          [bankId, req.user.tenantId]
        );
        if (bank.rowCount === 0) {
          throw Object.assign(new Error('البنك غير موجود'), { statusCode: 400 });
        }
      }
      return createBankAccount(client, req.user.tenantId, {
        bankId,
        accountKind,
        name: names.name,
        nameEn: names.name_en,
        nameHe: names.name_he,
        accountNumber,
        currencyId,
      });
    });
    res.status(201).json({ success: true, id });
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23505') {
      return res.status(409).json({ error: 'تعارض في إنشاء الحساب البنكي' });
    }
    console.error('Creating bank account failed:', err);
    res.status(500).json({ error: 'تعذّر إنشاء الحساب البنكي' });
  }
});

router.patch('/bank-accounts/:id', requireAuth, requirePermission('accounts', 'edit'), async (req, res) => {
  try {
    await withTenantClient(req.user.tenantId, async (client) => {
      const existing = await client.query(
        `SELECT id, chart_account_id FROM bank_accounts WHERE id = $1 AND tenant_id = $2`,
        [req.params.id, req.user.tenantId]
      );
      if (existing.rowCount === 0) {
        throw Object.assign(new Error('الحساب البنكي غير موجود'), { statusCode: 404 });
      }

      const fields = [];
      const values = [req.params.id];
      const push = (col, val) => {
        values.push(val);
        fields.push(`${col} = $${values.length}`);
      };

      if (req.body.name !== undefined) {
        const n = String(req.body.name || '').trim();
        if (!n) throw Object.assign(new Error('اسم الحساب مطلوب'), { statusCode: 400 });
        const { namesFromBody } = require('../i18n/localizeNames');
        const names = await namesFromBody(client, req.user.tenantId, req.body);
        push('name', names.name);
        push('name_en', names.name_en);
        push('name_he', names.name_he);
      }
      if (req.body.accountNumber !== undefined) {
        push('account_number', (req.body.accountNumber || '').trim() || null);
      }
      if (req.body.bankId !== undefined) push('bank_id', req.body.bankId || null);
      if (req.body.currencyId !== undefined) push('currency_id', req.body.currencyId || null);
      if (req.body.isActive !== undefined) push('is_active', Boolean(req.body.isActive));

      if (fields.length) {
        await client.query(`UPDATE bank_accounts SET ${fields.join(', ')} WHERE id = $1`, values);
      }

      const updated = await client.query(
        `SELECT chart_account_id, name, name_en, name_he, is_active FROM bank_accounts WHERE id = $1`,
        [req.params.id]
      );
      const u = updated.rows[0];
      await client.query(
        `UPDATE chart_of_accounts
         SET account_name = $2,
             account_name_ar = $2,
             account_name_en = COALESCE($3, account_name_en),
             account_name_he = COALESCE($4, account_name_he),
             is_active = $5
         WHERE id = $1`,
        [u.chart_account_id, u.name, u.name_en, u.name_he, u.is_active]
      );
    });
    res.json({ success: true });
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Updating bank account failed:', err);
    res.status(500).json({ error: 'تعذّر تعديل الحساب البنكي' });
  }
});

// ---------- دفاتر الشيكات ----------

const ISSUING_ACCOUNT_KINDS = new Set(['CURRENT', 'PAYMENT']);

async function loadBankAccountForCheckbooks(client, tenantId, bankAccountId) {
  const result = await client.query(
    `SELECT ba.id, ba.account_kind, ba.is_active,
            b.bank_number, b.name AS bank_name
     FROM bank_accounts ba
     LEFT JOIN banks b ON b.id = ba.bank_id
     WHERE ba.id = $1 AND ba.tenant_id = $2`,
    [bankAccountId, tenantId]
  );
  return result.rows[0] || null;
}

router.get(
  '/bank-accounts/:id/checkbooks',
  requireAuth,
  LIST_ACCESS,
  async (req, res) => {
    try {
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const account = await loadBankAccountForCheckbooks(
          client,
          req.user.tenantId,
          req.params.id
        );
        if (!account) {
          throw Object.assign(new Error('الحساب البنكي غير موجود'), { statusCode: 404 });
        }
        const result = await client.query(
          `SELECT * FROM checkbooks
           WHERE bank_account_id = $1
           ORDER BY issued_at DESC, created_at DESC`,
          [req.params.id]
        );
        return result.rows.map(mapCheckbook);
      });
      res.json(rows);
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(503).json({
          error: 'جدول دفاتر الشيكات غير مهيّأ — أعد تشغيل السيرفر أو نفّذ npm run migrate:checkbooks',
        });
      }
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Listing checkbooks failed:', err);
      res.status(500).json({ error: 'تعذّر جلب دفاتر الشيكات' });
    }
  }
);

router.get(
  '/bank-accounts/:id/next-check-number',
  requireAuth,
  requireAnyPermission([['payments', 'edit'], ['accounts', 'view']]),
  async (req, res) => {
    try {
      const payload = await withTenantClient(req.user.tenantId, async (client) => {
        const account = await loadBankAccountForCheckbooks(
          client,
          req.user.tenantId,
          req.params.id
        );
        if (!account) {
          throw Object.assign(new Error('الحساب البنكي غير موجود'), { statusCode: 404 });
        }
        const checkbookId = req.query.checkbookId || null;
        const book = await findAvailableCheckbook(client, req.params.id, checkbookId);
        if (!book) {
          return {
            available: false,
            bankNumber: account.bank_number || null,
            bankName: account.bank_name || null,
          };
        }
        return {
          available: true,
          checkNumber: book.next_serial,
          checkbookId: book.id,
          serialFrom: book.serial_from,
          serialTo: book.serial_to,
          remaining: countRemaining(book.next_serial, book.serial_to),
          bankNumber: book.bank_number || account.bank_number || null,
          bankName: book.bank_name || account.bank_name || null,
        };
      });
      res.json(payload);
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Fetching next check number failed:', err);
      res.status(500).json({ error: 'تعذّر جلب الرقم التسلسلي التالي' });
    }
  }
);

router.post(
  '/bank-accounts/:id/checkbooks',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    const serialFrom = normalizeSerial(req.body.serialFrom);
    const serialTo = normalizeSerial(req.body.serialTo);
    const nextSerial = normalizeSerial(req.body.nextSerial || serialFrom);

    if (!serialFrom || !serialTo) {
      return res.status(400).json({ error: 'يجب تحديد الرقم الأول والأخير في الدفتر' });
    }
    if (compareSerials(serialFrom, serialTo) > 0) {
      return res.status(400).json({ error: 'الرقم الأول يجب أن يكون أصغر من أو يساوي الرقم الأخير' });
    }
    if (!serialInRange(nextSerial, serialFrom, serialTo)) {
      return res.status(400).json({ error: 'الرقم التالي يجب أن يكون ضمن نطاق الدفتر' });
    }

    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        const account = await loadBankAccountForCheckbooks(
          client,
          req.user.tenantId,
          req.params.id
        );
        if (!account) {
          throw Object.assign(new Error('الحساب البنكي غير موجود'), { statusCode: 404 });
        }
        if (!ISSUING_ACCOUNT_KINDS.has(account.account_kind)) {
          throw Object.assign(
            new Error('دفتر الشيكات يُصدر فقط لحساب جاري أو حساب دفع'),
            { statusCode: 400 }
          );
        }
        if (!account.is_active) {
          throw Object.assign(new Error('الحساب البنكي غير فعّال'), { statusCode: 400 });
        }

        const result = await client.query(
          `INSERT INTO checkbooks
             (tenant_id, bank_account_id, serial_from, serial_to, next_serial, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           RETURNING *`,
          [req.user.tenantId, req.params.id, serialFrom, serialTo, nextSerial]
        );
        return result.rows[0];
      });
      res.status(201).json({ success: true, checkbook: mapCheckbook(row) });
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(503).json({
          error: 'جدول دفاتر الشيكات غير مهيّأ — أعد تشغيل السيرفر أو نفّذ npm run migrate:checkbooks',
        });
      }
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Issuing checkbook failed:', err);
      res.status(500).json({ error: 'تعذّر إصدار دفتر الشيكات' });
    }
  }
);

module.exports = router;
