const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { nextAccountCode } = require('../settings/numbering');
const { syncPartyAccountName } = require('../parties/syncAccountName');
const { insertChartAccount } = require('../accounting/chartAccounts');

router.post(
  '/suppliers',
  requireAuth,
  requirePermission('payments'),
  async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم المورد مطلوب' });
    }

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const accountCode = await nextAccountCode(client, req.user.tenantId, 'suppliers');
        const accountId = await insertChartAccount(client, req.user.tenantId, {
          accountCode,
          accountName: `مورد: ${name}`,
          accountNameAr: `مورد: ${name}`,
          accountNameEn: `Supplier: ${name}`,
          accountNameHe: `ספק: ${name}`,
          accountType: 'LIABILITY',
          currencyId: req.body.currencyId || null,
        });
        const partyResult = await client.query(
          `INSERT INTO parties (tenant_id, party_type, name, phone, account_id)
           VALUES ($1, 'SUPPLIER', $2, $3, $4)
           RETURNING id`,
          [req.user.tenantId, name.trim(), phone || null, accountId]
        );
        return { supplierId: partyResult.rows[0].id, accountId };
      });
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      console.error('Supplier creation failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل المورد' });
    }
  }
);

router.patch(
  '/suppliers/:id',
  requireAuth,
  requirePermission('payments', 'edit'),
  async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم المورد مطلوب' });
    }
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, account_id FROM parties WHERE id = $1 AND party_type = 'SUPPLIER'`,
          [req.params.id]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('المورد غير موجود'), { statusCode: 404 });
        }
        const { account_id: accountId } = existing.rows[0];
        await client.query(
          `UPDATE parties SET name = $2, phone = $3 WHERE id = $1`,
          [req.params.id, name.trim(), phone || null]
        );
        await syncPartyAccountName(client, accountId, 'SUPPLIER', name.trim());
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Supplier update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث بيانات المورد' });
    }
  }
);

router.get('/suppliers', requireAuth, requirePermission('payments', 'view'), async (req, res) => {
  try {
    const suppliers = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone, p.account_id,
          COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) AS balance
        FROM parties p
        LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
        WHERE p.party_type = 'SUPPLIER'
        GROUP BY p.id, p.name, p.phone, p.account_id
        ORDER BY p.name ASC
      `);
      return result.rows;
    });
    res.json(suppliers);
  } catch (err) {
    console.error('Fetching suppliers failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الموردين' });
  }
});

module.exports = router;
