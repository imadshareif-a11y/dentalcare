// routes/chartTree.js
// شجرة الحسابات: عرض هرمي + إضافة/تعديل/نقل/حذف.

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { dedupeChartRows } = require('../accounting/listDedupe');
const { resolveAccountCurrencyId } = require('../accounting/accountCurrency');

const LIST_ACCESS = requireAnyPermission([
  ['accounts', 'view'],
  ['journal', 'edit'],
  ['reports', 'view'],
]);

const ACCOUNT_TYPES = new Set(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']);

function mapRow(row) {
  return {
    id: row.id,
    account_code: row.account_code,
    account_name: row.account_name,
    account_name_ar: row.account_name_ar,
    account_name_en: row.account_name_en,
    account_name_he: row.account_name_he,
    account_type: row.account_type,
    parent_id: row.parent_id || null,
    is_group: Boolean(row.is_group),
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
    party_type: row.party_type || null,
    has_children: Number(row.child_count || 0) > 0,
    is_linked: Boolean(row.is_linked),
    has_movements: Boolean(row.has_movements),
    currency_id: row.currency_id || null,
    currency_code: row.currency_code || null,
    currency_symbol: row.currency_symbol || null,
  };
}

async function assertNoCycle(client, tenantId, accountId, newParentId) {
  if (!newParentId) return;
  if (newParentId === accountId) {
    throw Object.assign(new Error('لا يمكن جعل الحساب أبًا لنفسه'), { statusCode: 400 });
  }
  let cursor = newParentId;
  const seen = new Set();
  while (cursor) {
    if (cursor === accountId) {
      throw Object.assign(new Error('لا يمكن نقل الحساب تحت أحد فروعه'), { statusCode: 400 });
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const r = await client.query(
      `SELECT parent_id FROM chart_of_accounts WHERE id = $1 AND tenant_id = $2`,
      [cursor, tenantId]
    );
    cursor = r.rows[0]?.parent_id || null;
  }
}

async function loadAccount(client, tenantId, id) {
  const result = await client.query(
    `SELECT a.*,
            c.code AS currency_code,
            c.symbol AS currency_symbol,
            p.party_type,
            (SELECT COUNT(*)::int FROM chart_of_accounts ch WHERE ch.parent_id = a.id AND ch.tenant_id = a.tenant_id) AS child_count,
            EXISTS (
              SELECT 1 FROM parties x WHERE x.account_id = a.id AND x.tenant_id = a.tenant_id
              UNION ALL SELECT 1 FROM cash_boxes x WHERE x.account_id = a.id AND x.tenant_id = a.tenant_id
              UNION ALL SELECT 1 FROM bank_accounts x WHERE x.chart_account_id = a.id AND x.tenant_id = a.tenant_id
            ) AS is_linked,
            EXISTS (
              SELECT 1 FROM journal_entry_lines l WHERE l.account_id = a.id AND l.tenant_id = a.tenant_id LIMIT 1
            ) AS has_movements
     FROM chart_of_accounts a
     LEFT JOIN currencies c ON c.id = a.currency_id AND c.tenant_id = a.tenant_id
     LEFT JOIN LATERAL (
       SELECT party_type FROM parties p WHERE p.account_id = a.id AND p.tenant_id = a.tenant_id LIMIT 1
     ) p ON TRUE
     WHERE a.id = $1 AND a.tenant_id = $2`,
    [id, tenantId]
  );
  return result.rows[0] || null;
}

router.get(
  '/chart-tree',
  requireAuth,
  LIST_ACCESS,
  async (req, res) => {
    try {
      const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT a.id, a.account_code, a.account_name, a.account_name_ar, a.account_name_en, a.account_name_he,
                  a.account_type, a.parent_id, a.is_group, a.is_active, a.sort_order, a.currency_id,
                  c.code AS currency_code, c.symbol AS currency_symbol,
                  p.party_type,
                  (SELECT COUNT(*)::int FROM chart_of_accounts c WHERE c.parent_id = a.id AND c.tenant_id = a.tenant_id) AS child_count,
                  EXISTS (
                    SELECT 1 FROM parties x WHERE x.account_id = a.id AND x.tenant_id = a.tenant_id
                    UNION ALL SELECT 1 FROM cash_boxes x WHERE x.account_id = a.id AND x.tenant_id = a.tenant_id
                    UNION ALL SELECT 1 FROM bank_accounts x WHERE x.chart_account_id = a.id AND x.tenant_id = a.tenant_id
                  ) AS is_linked,
                  EXISTS (
                    SELECT 1 FROM journal_entry_lines l WHERE l.account_id = a.id AND l.tenant_id = a.tenant_id LIMIT 1
                  ) AS has_movements
           FROM chart_of_accounts a
           LEFT JOIN currencies c ON c.id = a.currency_id AND c.tenant_id = a.tenant_id
           LEFT JOIN LATERAL (
             SELECT party_type FROM parties p WHERE p.account_id = a.id AND p.tenant_id = a.tenant_id LIMIT 1
           ) p ON TRUE
           WHERE a.tenant_id = $1 ${includeInactive ? '' : 'AND a.is_active = TRUE'}
           ORDER BY a.account_type ASC, a.sort_order ASC, a.account_code ASC`,
          [req.user.tenantId]
        );
        return dedupeChartRows(result.rows.map(mapRow));
      });
      res.json(rows);
    } catch (err) {
      console.error('Listing chart tree failed:', err);
      res.status(500).json({ error: 'تعذّر جلب شجرة الحسابات' });
    }
  }
);

router.post(
  '/chart-tree',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    const name = String(req.body.name || '').trim();
    const accountCode = String(req.body.accountCode || '').trim();
    let accountType = String(req.body.accountType || '').toUpperCase();
    const parentId = req.body.parentId || null;
    const isGroup = Boolean(req.body.isGroup);
    const sortOrder = req.body.sortOrder != null ? Number(req.body.sortOrder) : null;

    if (!name) return res.status(400).json({ error: 'اسم الحساب مطلوب' });
    if (!accountCode || !/^\d{1,10}$/.test(accountCode)) {
      return res.status(400).json({ error: 'رمز الحساب يجب أن يكون أرقامًا' });
    }

    try {
      const row = await withTenantClient(req.user.tenantId, async (client) => {
        if (parentId) {
          const parent = await loadAccount(client, req.user.tenantId, parentId);
          if (!parent) throw Object.assign(new Error('الحساب الأب غير موجود'), { statusCode: 400 });
          accountType = parent.account_type;
        }
        if (!ACCOUNT_TYPES.has(accountType)) {
          throw Object.assign(new Error('نوع الحساب غير صالح'), { statusCode: 400 });
        }

        const exists = await client.query(
          `SELECT id, account_name, account_name_ar FROM chart_of_accounts
           WHERE tenant_id = $1 AND account_code = $2`,
          [req.user.tenantId, accountCode]
        );
        if (exists.rowCount > 0) {
          const row = exists.rows[0];
          const wanted = String(name).trim();
          const existingName = String(row.account_name_ar || row.account_name || '').trim();
          if (wanted === existingName) {
            throw Object.assign(new Error('هذا الحساب موجود مسبقًا'), { statusCode: 409 });
          }
          throw Object.assign(new Error('رمز الحساب مستخدم مسبقًا'), { statusCode: 409 });
        }

        let order = sortOrder;
        if (!Number.isFinite(order)) {
          const max = await client.query(
            `SELECT COALESCE(MAX(sort_order), 0) AS m FROM chart_of_accounts
             WHERE tenant_id = $1 AND account_type = $2
               AND (($3::uuid IS NULL AND parent_id IS NULL) OR parent_id = $3)`,
            [req.user.tenantId, accountType, parentId]
          );
          order = Number(max.rows[0].m) + 10;
        }

        const { namesFromBody } = require('../i18n/localizeNames');
        const names = await namesFromBody(client, req.user.tenantId, req.body);
        const currencyId = await resolveAccountCurrencyId(
          client,
          req.user.tenantId,
          req.body.currencyId || null
        );

        const result = await client.query(
          `INSERT INTO chart_of_accounts
             (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he,
              account_type, parent_id, is_group, is_active, sort_order, currency_id)
           VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, TRUE, $9, $10)
           RETURNING id`,
          [req.user.tenantId, accountCode, names.name, names.name_en, names.name_he, accountType, parentId, isGroup, order, currencyId]
        );

        // إذا أُضيف ابن تحت حساب غير تجميعي، حوّله لتجميعي تلقائيًا إن لم تكن له حركات
        if (parentId) {
          const parent = await loadAccount(client, req.user.tenantId, parentId);
          if (parent && !parent.is_group && !parent.has_movements) {
            await client.query(
              `UPDATE chart_of_accounts SET is_group = TRUE WHERE id = $1 AND tenant_id = $2`,
              [parentId, req.user.tenantId]
            );
          }
        }

        return loadAccount(client, req.user.tenantId, result.rows[0].id);
      });

      res.status(201).json({ success: true, account: mapRow(row) });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 409) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23505') {
        return res.status(409).json({ error: 'رمز الحساب مستخدم مسبقًا' });
      }
      console.error('Creating chart account failed:', err);
      res.status(500).json({ error: 'تعذّر إنشاء الحساب' });
    }
  }
);

router.patch(
  '/chart-tree/:id',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    try {
      const account = await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await loadAccount(client, req.user.tenantId, req.params.id);
        if (!existing) throw Object.assign(new Error('الحساب غير موجود'), { statusCode: 404 });

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
          push('account_name', names.name);
          push('account_name_ar', names.name);
          push('account_name_en', names.name_en);
          push('account_name_he', names.name_he);
        }
        if (req.body.accountCode !== undefined) {
          const code = String(req.body.accountCode || '').trim();
          if (!/^\d{1,10}$/.test(code)) {
            throw Object.assign(new Error('رمز الحساب يجب أن يكون أرقامًا'), { statusCode: 400 });
          }
          const clash = await client.query(
            `SELECT 1 FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = $2 AND id <> $3`,
            [req.user.tenantId, code, req.params.id]
          );
          if (clash.rowCount > 0) {
            throw Object.assign(new Error('رمز الحساب مستخدم مسبقًا'), { statusCode: 409 });
          }
          push('account_code', code);
        }
        if (req.body.isGroup !== undefined) {
          if (req.body.isGroup && existing.has_movements) {
            throw Object.assign(
              new Error('لا يمكن تحويل حساب عليه حركات إلى حساب تجميعي'),
              { statusCode: 400 }
            );
          }
          push('is_group', Boolean(req.body.isGroup));
        }
        if (req.body.isActive !== undefined) {
          push('is_active', Boolean(req.body.isActive));
        }
        if (req.body.sortOrder !== undefined) {
          push('sort_order', Number(req.body.sortOrder) || 0);
        }
        if (req.body.currencyId !== undefined) {
          if (existing.is_linked) {
            throw Object.assign(
              new Error('لا يمكن تغيير عملة حساب مرتبط بذمة أو صندوق أو بنك'),
              { statusCode: 400 }
            );
          }
          const currencyId = await resolveAccountCurrencyId(
            client,
            req.user.tenantId,
            req.body.currencyId || null
          );
          push('currency_id', currencyId);
        }

        if (req.body.parentId !== undefined || req.body.accountType !== undefined) {
          let parentId = req.body.parentId !== undefined ? (req.body.parentId || null) : existing.parent_id;
          let accountType = existing.account_type;

          if (parentId) {
            await assertNoCycle(client, req.user.tenantId, req.params.id, parentId);
            const parent = await loadAccount(client, req.user.tenantId, parentId);
            if (!parent) throw Object.assign(new Error('الحساب الأب غير موجود'), { statusCode: 400 });
            accountType = parent.account_type;
          } else if (req.body.accountType !== undefined) {
            accountType = String(req.body.accountType || '').toUpperCase();
            if (!ACCOUNT_TYPES.has(accountType)) {
              throw Object.assign(new Error('نوع الحساب غير صالح'), { statusCode: 400 });
            }
          }

          if (req.body.parentId !== undefined) push('parent_id', parentId);
          if (accountType !== existing.account_type) {
            // حدّث النوع للفروع أيضًا عند النقل لجذر نوع آخر
            await client.query(
              `WITH RECURSIVE subtree AS (
                 SELECT id FROM chart_of_accounts WHERE id = $1 AND tenant_id = $3
                 UNION ALL
                 SELECT c.id FROM chart_of_accounts c
                 JOIN subtree s ON c.parent_id = s.id AND c.tenant_id = $3
               )
               UPDATE chart_of_accounts SET account_type = $2
               WHERE tenant_id = $3 AND id IN (SELECT id FROM subtree)`,
              [req.params.id, accountType, req.user.tenantId]
            );
          }
        }

        if (fields.length) {
          values.push(req.user.tenantId);
          await client.query(
            `UPDATE chart_of_accounts SET ${fields.join(', ')} WHERE id = $1 AND tenant_id = $${values.length}`,
            values
          );
        }

        return loadAccount(client, req.user.tenantId, req.params.id);
      });

      res.json({ success: true, account: mapRow(account) });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404 || err.statusCode === 409) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Updating chart account failed:', err);
      res.status(500).json({ error: 'تعذّر تعديل الحساب' });
    }
  }
);

router.delete(
  '/chart-tree/:id',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await loadAccount(client, req.user.tenantId, req.params.id);
        if (!existing) throw Object.assign(new Error('الحساب غير موجود'), { statusCode: 404 });
        if (Number(existing.child_count) > 0) {
          throw Object.assign(new Error('احذف الفروع أولًا أو انقلها'), { statusCode: 400 });
        }
        if (existing.is_linked) {
          throw Object.assign(
            new Error('الحساب مرتبط بذمة أو صندوق أو بنك — لا يمكن حذفه'),
            { statusCode: 400 }
          );
        }
        if (existing.has_movements) {
          throw Object.assign(
            new Error('الحساب عليه حركات — عطّله بدل الحذف'),
            { statusCode: 400 }
          );
        }

        await client.query(`DELETE FROM chart_of_accounts WHERE id = $1 AND tenant_id = $2`, [req.params.id, req.user.tenantId]);
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23503') {
        return res.status(400).json({ error: 'لا يمكن حذف الحساب لارتباطه ببيانات أخرى' });
      }
      console.error('Deleting chart account failed:', err);
      res.status(500).json({ error: 'تعذّر حذف الحساب' });
    }
  }
);

module.exports = router;
