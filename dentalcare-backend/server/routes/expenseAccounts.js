// routes/expenseAccounts.js
// إدارة حسابات المصاريف في دليل الحسابات (EXPENSE).

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { insertChartAccount } = require('../accounting/chartAccounts');

const LIST_ACCESS = requireAnyPermission([
  ['accounts', 'view'],
  ['payments', 'edit'],
  ['journal', 'edit'],
  ['reports', 'view'],
]);

const CODE_START = 5000;
const CODE_END = 5999;

async function nextExpenseCode(client, tenantId) {
  const used = await client.query(
    `SELECT account_code FROM chart_of_accounts
     WHERE tenant_id = $1
       AND account_code ~ '^[0-9]+$'
       AND account_code::int BETWEEN $2 AND $3`,
    [tenantId, CODE_START, CODE_END]
  );
  const taken = new Set(used.rows.map((r) => Number(r.account_code)));
  for (let n = CODE_START; n <= CODE_END; n += 1) {
    if (!taken.has(n)) return String(n);
  }
  throw Object.assign(new Error(`لا يوجد رقم حساب متاح في النطاق ${CODE_START}-${CODE_END}`), { statusCode: 400 });
}

function mapRow(row) {
  return {
    id: row.id,
    account_code: row.account_code,
    account_name: row.account_name,
    account_name_ar: row.account_name_ar,
    account_name_en: row.account_name_en,
    account_name_he: row.account_name_he,
    account_type: row.account_type,
    is_active: row.is_active,
  };
}

router.get(
  '/expense-accounts',
  requireAuth,
  LIST_ACCESS,
  async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, account_code, account_name, account_name_ar, account_name_en, account_name_he,
                  account_type, is_active
           FROM chart_of_accounts
           WHERE tenant_id = $1 AND account_type = 'EXPENSE'
             ${includeInactive ? '' : 'AND is_active = TRUE'}
           ORDER BY account_code ASC`,
          [req.user.tenantId]
        );
        return result.rows.map(mapRow);
      });
      res.json(rows);
    } catch (err) {
      console.error('Listing expense accounts failed:', err);
      res.status(500).json({ error: 'تعذّر جلب حسابات المصاريف' });
    }
  }
);

router.post(
  '/expense-accounts',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    const name = String(req.body.name || '').trim();
    const accountCode = (req.body.accountCode || '').trim() || null;

    if (!name) {
      return res.status(400).json({ error: 'اسم حساب المصروف مطلوب' });
    }

    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        const { namesFromBody } = require('../i18n/localizeNames');
        const names = await namesFromBody(client, req.user.tenantId, req.body);
        let code = accountCode;
        if (code) {
          if (!/^\d{3,10}$/.test(code)) {
            throw Object.assign(new Error('رمز الحساب يجب أن يكون أرقامًا فقط'), { statusCode: 400 });
          }
          const exists = await client.query(
            `SELECT 1 FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2`,
            [req.user.tenantId, code]
          );
          if (exists.rowCount > 0) {
            throw Object.assign(new Error('رمز الحساب مستخدم مسبقًا'), { statusCode: 409 });
          }
        } else {
          code = await nextExpenseCode(client, req.user.tenantId);
        }

        const accountId = await insertChartAccount(client, req.user.tenantId, {
          accountCode: code,
          accountName: names.name,
          accountNameAr: names.name,
          accountNameEn: names.name_en,
          accountNameHe: names.name_he,
          accountType: 'EXPENSE',
          currencyId: req.body.currencyId || null,
        });
        const result = await client.query(
          `SELECT id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type, is_active
           FROM chart_of_accounts WHERE id = $1`,
          [accountId]
        );
        return result.rows[0];
      });
      res.status(201).json({ success: true, id: row.id, account: mapRow(row) });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23505') {
        return res.status(409).json({ error: 'رمز الحساب مستخدم مسبقًا' });
      }
      console.error('Creating expense account failed:', err);
      res.status(500).json({ error: 'تعذّر إنشاء حساب المصروف' });
    }
  }
);

router.patch(
  '/expense-accounts/:id',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id FROM chart_of_accounts WHERE id = $1 AND tenant_id = $2 AND account_type = 'EXPENSE'`,
          [req.params.id, req.user.tenantId]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('حساب المصروف غير موجود'), { statusCode: 404 });
        }

        const fields = [];
        const values = [req.params.id];
        const push = (col, val) => {
          values.push(val);
          fields.push(`${col} = $${values.length}`);
        };

        if (req.body.name !== undefined) {
          const n = String(req.body.name || '').trim();
          if (!n) throw Object.assign(new Error('اسم حساب المصروف مطلوب'), { statusCode: 400 });
          const { namesFromBody } = require('../i18n/localizeNames');
          const names = await namesFromBody(client, req.user.tenantId, req.body);
          push('account_name', names.name);
          push('account_name_ar', names.name);
          push('account_name_en', names.name_en);
          push('account_name_he', names.name_he);
        }
        if (req.body.isActive !== undefined) {
          push('is_active', Boolean(req.body.isActive));
        }

        if (fields.length) {
          values.push(req.user.tenantId);
          await client.query(
            `UPDATE chart_of_accounts SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $${values.length}`,
            values
          );
        }
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Updating expense account failed:', err);
      res.status(500).json({ error: 'تعذّر تعديل حساب المصروف' });
    }
  }
);

module.exports = router;
