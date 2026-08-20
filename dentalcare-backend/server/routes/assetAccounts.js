// routes/assetAccounts.js
// إدارة حسابات الأصول في دليل الحسابات (ASSET) — غير صناديق/بنوك/ذمم.

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

const LIST_ACCESS = requireAnyPermission([
  ['accounts', 'view'],
  ['payments', 'edit'],
  ['journal', 'edit'],
  ['reports', 'view'],
]);

// نطاق للأصول العامة (بعد نقد/بنوك/حافظات الشيكات 1000–1299)
const CODE_START = 1300;
const CODE_END = 1999;

const ASSET_FILTER = `
  account_type = 'ASSET'
  AND id NOT IN (SELECT account_id FROM cash_boxes WHERE account_id IS NOT NULL)
  AND id NOT IN (SELECT chart_account_id FROM bank_accounts WHERE chart_account_id IS NOT NULL)
  AND id NOT IN (SELECT account_id FROM parties WHERE account_id IS NOT NULL)
`;

async function nextAssetCode(client, tenantId) {
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
  '/asset-accounts',
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
           WHERE ${ASSET_FILTER}
             ${includeInactive ? '' : 'AND is_active = TRUE'}
           ORDER BY account_code ASC`
        );
        return result.rows.map(mapRow);
      });
      res.json(rows);
    } catch (err) {
      console.error('Listing asset accounts failed:', err);
      res.status(500).json({ error: 'تعذّر جلب حسابات الأصول' });
    }
  }
);

router.post(
  '/asset-accounts',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    const name = String(req.body.name || '').trim();
    const nameEn = (req.body.nameEn || '').trim() || null;
    const nameHe = (req.body.nameHe || '').trim() || null;
    const accountCode = (req.body.accountCode || '').trim() || null;

    if (!name) {
      return res.status(400).json({ error: 'اسم حساب الأصل مطلوب' });
    }

    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
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
          code = await nextAssetCode(client, req.user.tenantId);
        }

        const result = await client.query(
          `INSERT INTO chart_of_accounts
             (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type, is_active)
           VALUES ($1, $2, $3, $3, $4, $5, 'ASSET', TRUE)
           RETURNING id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type, is_active`,
          [req.user.tenantId, code, name, nameEn, nameHe]
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
      console.error('Creating asset account failed:', err);
      res.status(500).json({ error: 'تعذّر إنشاء حساب الأصل' });
    }
  }
);

router.patch(
  '/asset-accounts/:id',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id FROM chart_of_accounts WHERE id = $1 AND ${ASSET_FILTER}`,
          [req.params.id]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('حساب الأصل غير موجود'), { statusCode: 404 });
        }

        const fields = [];
        const values = [req.params.id];
        const push = (col, val) => {
          values.push(val);
          fields.push(`${col} = $${values.length}`);
        };

        if (req.body.name !== undefined) {
          const name = String(req.body.name || '').trim();
          if (!name) throw Object.assign(new Error('اسم حساب الأصل مطلوب'), { statusCode: 400 });
          push('account_name', name);
          push('account_name_ar', name);
        }
        if (req.body.nameEn !== undefined) {
          push('account_name_en', (req.body.nameEn || '').trim() || null);
        }
        if (req.body.nameHe !== undefined) {
          push('account_name_he', (req.body.nameHe || '').trim() || null);
        }
        if (req.body.isActive !== undefined) {
          push('is_active', Boolean(req.body.isActive));
        }

        if (fields.length) {
          await client.query(
            `UPDATE chart_of_accounts SET ${fields.join(', ')} WHERE id = $1`,
            values
          );
        }
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Updating asset account failed:', err);
      res.status(500).json({ error: 'تعذّر تعديل حساب الأصل' });
    }
  }
);

module.exports = router;
