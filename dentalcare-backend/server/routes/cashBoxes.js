// routes/cashBoxes.js
const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const {
  KIND_META,
  ensureBoxesForAllCurrencies,
  createManualBox,
} = require('../accounting/cashBoxes');
const { dedupeById } = require('../accounting/listDedupe');

const LIST_ACCESS = requireAnyPermission([
  ['accounts', 'view'],
  ['receipts', 'edit'],
  ['payments', 'edit'],
  ['journal', 'edit'],
]);

function mapRow(row) {
  return {
    id: row.id,
    currency_id: row.currency_id,
    currency_code: row.currency_code,
    currency_symbol: row.currency_symbol,
    currency_is_base: row.currency_is_base,
    box_kind: row.box_kind,
    name: row.name,
    name_en: row.name_en,
    name_he: row.name_he,
    account_id: row.account_id,
    account_code: row.account_code,
    account_type: row.account_type,
    is_system: row.is_system,
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

router.get(
  '/cash-boxes',
  requireAuth,
  LIST_ACCESS,
  async (req, res) => {
    try {
      const kind = req.query.kind ? String(req.query.kind).toUpperCase() : null;
      const currencyId = req.query.currencyId || null;
      const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';

      const rows = await withTenantClient(req.user.tenantId, async (client) => {
        // ضمان صناديق النظام للعملات الحالية (ترحيل تدريجي)
        await ensureBoxesForAllCurrencies(client, req.user.tenantId);

        const params = [];
        const where = ['cb.tenant_id = $1'];
        params.push(req.user.tenantId);

        if (!includeInactive) {
          where.push('cb.is_active = TRUE');
        }
        if (kind) {
          if (kind === 'CHECKS') {
            where.push(`cb.box_kind IN ('CHECKS_IN', 'CHECKS_OUT')`);
          } else if (KIND_META[kind]) {
            params.push(kind);
            where.push(`cb.box_kind = $${params.length}`);
          }
        }
        if (currencyId) {
          params.push(currencyId);
          where.push(`cb.currency_id = $${params.length}`);
        }

        const result = await client.query(
          `SELECT cb.*, c.code AS currency_code, c.symbol AS currency_symbol, c.is_base AS currency_is_base,
                  a.account_code, a.account_type
           FROM cash_boxes cb
           JOIN currencies c ON c.id = cb.currency_id
           JOIN chart_of_accounts a ON a.id = cb.account_id
           WHERE ${where.join(' AND ')}
           ORDER BY cb.box_kind ASC, c.is_base DESC, c.code ASC, a.account_code ASC`,
          params
        );
        return dedupeById(result.rows.map(mapRow), 'id');
      });

      res.json(rows);
    } catch (err) {
      console.error('Listing cash boxes failed:', err);
      res.status(500).json({ error: 'تعذّر جلب الصناديق' });
    }
  }
);

router.post(
  '/cash-boxes',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    const boxKind = String(req.body.boxKind || '').toUpperCase();
    const currencyId = req.body.currencyId;

    if (!KIND_META[boxKind]) {
      return res.status(400).json({ error: 'نوع الصندوق غير صالح' });
    }
    if (!currencyId) {
      return res.status(400).json({ error: 'يجب تحديد العملة' });
    }
    if (!req.body.name || !String(req.body.name).trim()) {
      return res.status(400).json({ error: 'اسم الصندوق مطلوب' });
    }

    try {
      const id = await withTenantClient(req.user.tenantId, async (client) => {
        const { namesFromBody } = require('../i18n/localizeNames');
        const names = await namesFromBody(client, req.user.tenantId, req.body);
        return createManualBox(client, req.user.tenantId, {
          currencyId,
          boxKind,
          name: names.name,
          nameEn: names.name_en,
          nameHe: names.name_he,
        });
      });
      res.status(201).json({ success: true, id });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err.code === '23505') {
        return res.status(409).json({ error: 'تعارض في إنشاء الصندوق أو الحساب' });
      }
      console.error('Creating cash box failed:', err);
      res.status(500).json({ error: 'تعذّر إنشاء الصندوق' });
    }
  }
);

router.patch(
  '/cash-boxes/:id',
  requireAuth,
  requirePermission('accounts', 'edit'),
  async (req, res) => {
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined;

    if (req.body.name !== undefined && !String(req.body.name || '').trim()) {
      return res.status(400).json({ error: 'اسم الصندوق مطلوب' });
    }

    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        let resolvedNames = null;
        if (req.body.name !== undefined) {
          const { namesFromBody } = require('../i18n/localizeNames');
          resolvedNames = await namesFromBody(client, req.user.tenantId, req.body);
        }
        const existing = await client.query(
          `SELECT id, account_id, is_system FROM cash_boxes WHERE id = $1`,
          [req.params.id]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('الصندوق غير موجود'), { statusCode: 404 });
        }

        const fields = [];
        const values = [req.params.id];
        const push = (col, val) => {
          values.push(val);
          fields.push(`${col} = $${values.length}`);
        };

        if (resolvedNames) {
          push('name', resolvedNames.name);
          push('name_en', resolvedNames.name_en);
          push('name_he', resolvedNames.name_he);
        }
        if (isActive !== undefined) push('is_active', isActive);

        if (fields.length === 0) return;

        await client.query(
          `UPDATE cash_boxes SET ${fields.join(', ')} WHERE id = $1`,
          values
        );

        // مزامنة اسم الحساب المرتبط
        if (name !== undefined || nameEn !== undefined || nameHe !== undefined) {
          const box = await client.query(
            `SELECT account_id, name, name_en, name_he FROM cash_boxes WHERE id = $1`,
            [req.params.id]
          );
          const b = box.rows[0];
          await client.query(
            `UPDATE chart_of_accounts
             SET account_name = $2,
                 account_name_ar = $2,
                 account_name_en = COALESCE($3, account_name_en),
                 account_name_he = COALESCE($4, account_name_he)
             WHERE id = $1`,
            [b.account_id, b.name, b.name_en, b.name_he]
          );
        }

        if (isActive === false) {
          await client.query(
            `UPDATE chart_of_accounts SET is_active = FALSE WHERE id = $1`,
            [existing.rows[0].account_id]
          );
        } else if (isActive === true) {
          await client.query(
            `UPDATE chart_of_accounts SET is_active = TRUE WHERE id = $1`,
            [existing.rows[0].account_id]
          );
        }
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Updating cash box failed:', err);
      res.status(500).json({ error: 'تعذّر تعديل الصندوق' });
    }
  }
);

module.exports = router;
