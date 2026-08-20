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
  const name = String(req.body.name || '').trim();
  const nameEn = (req.body.nameEn || '').trim() || null;
  const nameHe = (req.body.nameHe || '').trim() || null;
  const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

  if (!bankNumber) return res.status(400).json({ error: 'رقم البنك مطلوب' });
  if (!name) return res.status(400).json({ error: 'اسم البنك مطلوب' });

  try {
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO banks (tenant_id, bank_number, name, name_en, name_he, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [req.user.tenantId, bankNumber, name, nameEn, nameHe, isActive]
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
      const existing = await client.query(`SELECT id FROM banks WHERE id = $1`, [req.params.id]);
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
        push('name', n);
      }
      if (req.body.nameEn !== undefined) push('name_en', (req.body.nameEn || '').trim() || null);
      if (req.body.nameHe !== undefined) push('name_he', (req.body.nameHe || '').trim() || null);
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
  const name = String(req.body.name || '').trim();
  const nameEn = (req.body.nameEn || '').trim() || null;
  const nameHe = (req.body.nameHe || '').trim() || null;
  const accountNumber = (req.body.accountNumber || '').trim() || null;
  const bankId = req.body.bankId || null;
  const currencyId = req.body.currencyId || null;

  if (!KIND_META[accountKind]) {
    return res.status(400).json({ error: 'نوع الحساب البنكي غير صالح' });
  }
  if (!name) return res.status(400).json({ error: 'اسم الحساب مطلوب' });

  try {
    const id = await withTenantClient(req.user.tenantId, async (client) => {
      if (bankId) {
        const bank = await client.query(
          `SELECT id FROM banks WHERE id = $1 AND is_active = TRUE`,
          [bankId]
        );
        if (bank.rowCount === 0) {
          throw Object.assign(new Error('البنك غير موجود'), { statusCode: 400 });
        }
      }
      return createBankAccount(client, req.user.tenantId, {
        bankId,
        accountKind,
        name,
        nameEn,
        nameHe,
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
        `SELECT id, chart_account_id FROM bank_accounts WHERE id = $1`,
        [req.params.id]
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
        push('name', n);
      }
      if (req.body.nameEn !== undefined) push('name_en', (req.body.nameEn || '').trim() || null);
      if (req.body.nameHe !== undefined) push('name_he', (req.body.nameHe || '').trim() || null);
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

module.exports = router;
