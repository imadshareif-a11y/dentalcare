// routes/doctors.js
// -----------------------------------------------------------
// نفس نمط routes/patients.js بالضبط، بفرق جوهري واحد: حساب
// الطبيب نوعه LIABILITY مش RECEIVABLE (نحن المدينون له).
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

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
        const accountCode = `DOC-${Date.now()}`;
        const accountResult = await client.query(
          `INSERT INTO chart_of_accounts
             (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
           VALUES ($1, $2, $3, $3, $4, $5, 'LIABILITY')
           RETURNING id`,
          [req.user.tenantId, accountCode, `ذمة الطبيب: ${name}`, `Doctor: ${name}`, `רופא: ${name}`]
        );
        const accountId = accountResult.rows[0].id;

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

router.get('/doctors', requireAuth, requirePermission('doctors', 'view'), async (req, res) => {
  try {
    const doctors = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone,
          d.compensation_type, d.percentage_rate, d.monthly_salary,
          COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) AS balance
        FROM doctors d
        JOIN parties p ON p.id = d.party_id
        LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
        WHERE p.party_type = 'DOCTOR'
        GROUP BY p.id, p.name, p.phone, d.compensation_type, d.percentage_rate, d.monthly_salary
        ORDER BY p.name ASC
      `);
      return result.rows;
    });
    res.json(doctors);
  } catch (err) {
    console.error('Fetching doctors failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الأطباء' });
  }
});

module.exports = router;
