// routes/doctors.js
// -----------------------------------------------------------
// نفس نمط routes/patients.js بالضبط، بفرق جوهري واحد: حساب
// الطبيب نوعه LIABILITY مش RECEIVABLE (نحن المدينون له).
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { nextAccountCode } = require('../settings/numbering');
const { syncPartyAccountName } = require('../parties/syncAccountName');
const { insertChartAccount } = require('../accounting/chartAccounts');

router.post(
  '/doctors',
  requireAuth,
  requirePermission('doctors', 'edit'),
  async (req, res) => {
    const { name, phone, compensationType, percentageRate, monthlySalary } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم الطبيب مطلوب' });
    }
    if (!['SALARY', 'PERCENTAGE', 'PARTNER'].includes(compensationType)) {
      return res.status(400).json({ error: 'نوع التعويض غير صالح' });
    }
    if (compensationType === 'PERCENTAGE') {
      const rate = Number(percentageRate);
      if (!rate || rate <= 0 || rate > 100) {
        return res.status(400).json({ error: 'نسبة العمولة يجب أن تكون بين 0 و100' });
      }
    }
    if (compensationType === 'SALARY') {
      const salary = Number(monthlySalary);
      if (!salary || salary <= 0) {
        return res.status(400).json({ error: 'الراتب الشهري يجب أن يكون أكبر من صفر' });
      }
    }

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const accountCode = await nextAccountCode(client, req.user.tenantId, 'doctors');
        const accountId = await insertChartAccount(client, req.user.tenantId, {
          accountCode,
          accountName: `ذمة الطبيب: ${name}`,
          accountNameAr: `ذمة الطبيب: ${name}`,
          accountNameEn: `Doctor: ${name}`,
          accountNameHe: `רופא: ${name}`,
          accountType: 'LIABILITY',
          currencyId: req.body.currencyId || null,
        });

        const partyResult = await client.query(
          `INSERT INTO parties (tenant_id, party_type, name, phone, account_id)
           VALUES ($1, 'DOCTOR', $2, $3, $4)
           RETURNING id`,
          [req.user.tenantId, name.trim(), phone || null, accountId]
        );
        const doctorId = partyResult.rows[0].id;

        await client.query(
          `INSERT INTO doctors (party_id, tenant_id, compensation_type, percentage_rate, monthly_salary)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            doctorId, req.user.tenantId, compensationType,
            compensationType === 'PERCENTAGE' ? Number(percentageRate) : null,
            compensationType === 'SALARY' ? Number(monthlySalary) : null,
          ]
        );

        return { doctorId, accountId };
      });

      res.status(201).json({ success: true, ...result });
    } catch (err) {
      console.error('Doctor creation failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل الطبيب' });
    }
  }
);

router.patch(
  '/doctors/:id',
  requireAuth,
  requirePermission('doctors', 'edit'),
  async (req, res) => {
    const { name, phone, compensationType, percentageRate, monthlySalary } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم الطبيب مطلوب' });
    }
    if (!['SALARY', 'PERCENTAGE', 'PARTNER'].includes(compensationType)) {
      return res.status(400).json({ error: 'نوع التعويض غير صالح' });
    }
    if (compensationType === 'PERCENTAGE') {
      const rate = Number(percentageRate);
      if (!rate || rate <= 0 || rate > 100) {
        return res.status(400).json({ error: 'نسبة العمولة يجب أن تكون بين 0 و100' });
      }
    }
    if (compensationType === 'SALARY') {
      const salary = Number(monthlySalary);
      if (!salary || salary <= 0) {
        return res.status(400).json({ error: 'الراتب الشهري يجب أن يكون أكبر من صفر' });
      }
    }
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT p.id, p.account_id
           FROM parties p
           JOIN doctors d ON d.party_id = p.id
           WHERE p.id = $1 AND p.tenant_id = $2 AND p.party_type = 'DOCTOR'`,
          [req.params.id, req.user.tenantId]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('الطبيب غير موجود'), { statusCode: 404 });
        }
        const { account_id: accountId } = existing.rows[0];
        await client.query(
          `UPDATE parties SET name = $2, phone = $3 WHERE id = $1 AND tenant_id = $4`,
          [req.params.id, name.trim(), phone || null, req.user.tenantId]
        );
        await client.query(
          `UPDATE doctors
           SET compensation_type = $2, percentage_rate = $3, monthly_salary = $4
           WHERE party_id = $1 AND tenant_id = $5`,
          [
            req.params.id,
            compensationType,
            compensationType === 'PERCENTAGE' ? Number(percentageRate) : null,
            compensationType === 'SALARY' ? Number(monthlySalary) : null,
            req.user.tenantId,
          ]
        );
        await syncPartyAccountName(client, accountId, 'DOCTOR', name.trim());
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Doctor update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث بيانات الطبيب' });
    }
  }
);

router.get('/doctors', requireAuth, requirePermission('doctors', 'view'), async (req, res) => {
  try {
    const doctors = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone,
          d.compensation_type, d.percentage_rate, d.monthly_salary,
          COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) AS balance
        FROM doctors d
        JOIN parties p ON p.id = d.party_id AND p.tenant_id = d.tenant_id
        LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id AND l.tenant_id = d.tenant_id
        WHERE d.tenant_id = $1 AND p.party_type = 'DOCTOR'
        GROUP BY p.id, p.name, p.phone, d.compensation_type, d.percentage_rate, d.monthly_salary
        ORDER BY p.name ASC
      `, [req.user.tenantId]);
      return result.rows;
    });
    res.json(doctors);
  } catch (err) {
    console.error('Fetching doctors failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الأطباء' });
  }
});

module.exports = router;
