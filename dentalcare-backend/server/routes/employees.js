// routes/employees.js
const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { nextAccountCode } = require('../settings/numbering');
const { syncPartyAccountName } = require('../parties/syncAccountName');

router.post(
  '/employees',
  requireAuth,
  requirePermission('employees'),
  async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم الموظف مطلوب' });
    }

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const accountCode = await nextAccountCode(client, req.user.tenantId, 'employees');
        const accountResult = await client.query(
          `INSERT INTO chart_of_accounts
             (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
           VALUES ($1, $2, $3, $3, $4, $5, 'LIABILITY')
           RETURNING id`,
          [req.user.tenantId, accountCode, `موظف: ${name}`, `Employee: ${name}`, `עובד: ${name}`]
        );
        const accountId = accountResult.rows[0].id;
        const partyResult = await client.query(
          `INSERT INTO parties (tenant_id, party_type, name, phone, account_id)
           VALUES ($1, 'EMPLOYEE', $2, $3, $4)
           RETURNING id`,
          [req.user.tenantId, name.trim(), phone || null, accountId]
        );
        return { employeeId: partyResult.rows[0].id, accountId };
      });
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      console.error('Employee creation failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل الموظف' });
    }
  }
);

router.patch(
  '/employees/:id',
  requireAuth,
  requirePermission('employees', 'edit'),
  async (req, res) => {
    const { name, phone } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم الموظف مطلوب' });
    }
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, account_id FROM parties WHERE id = $1 AND party_type = 'EMPLOYEE'`,
          [req.params.id]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('الموظف غير موجود'), { statusCode: 404 });
        }
        const { account_id: accountId } = existing.rows[0];
        await client.query(
          `UPDATE parties SET name = $2, phone = $3 WHERE id = $1`,
          [req.params.id, name.trim(), phone || null]
        );
        await syncPartyAccountName(client, accountId, 'EMPLOYEE', name.trim());
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Employee update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث بيانات الموظف' });
    }
  }
);

router.get('/employees', requireAuth, requirePermission('employees', 'view'), async (req, res) => {
  try {
    const employees = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone, p.account_id,
          COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) AS balance
        FROM parties p
        LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
        WHERE p.party_type = 'EMPLOYEE'
        GROUP BY p.id, p.name, p.phone, p.account_id
        ORDER BY p.name ASC
      `);
      return result.rows;
    });
    res.json(employees);
  } catch (err) {
    console.error('Fetching employees failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الموظفين' });
  }
});

module.exports = router;
