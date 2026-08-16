// routes/patients.js
// -----------------------------------------------------------
// هون منشئ "التوحيد المطلق بين المريض والذمة" فعليًا: تسجيل
// مريض جديد = إنشاء حساب ذمة له بنفس العملية الذرية (transaction
// واحدة). ما في احتمال يتسجل مريض بدون حساب، أو حساب يتيم بدون
// مريض. هاي عملية بنائية (structural) مش مالية، فمن الطبيعي إنها
// تكتب مباشرة على chart_of_accounts و parties — بعكس القيود
// المحاسبية يلي لازم تمر حصرًا عبر postJournalEntry().
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

router.post(
  '/patients',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT', 'RECEPTIONIST']),
  async (req, res) => {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم المريض مطلوب' });
    }

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        // 1) ننشئ حساب ذمة جديد بشجرة الحسابات (نوع RECEIVABLE)
        // ملاحظة: اسم المريض نفسه ما بيتترجم (قرار متعمّد لحماية
        // دقة الهوية) — بس التسمية "ذمة:" قبل الاسم بتتكرر بنفس
        // الاسم بالأعمدة التلاتة، فبتضل الحساب قابل للعرض بأي لغة
        // واجهة، والاسم الفعلي زي ما انكتب بالضبط
        const accountCode = `PAT-${Date.now()}`; // بالإنتاج: مولّد أرقام تسلسلي حقيقي
        const accountResult = await client.query(
          `INSERT INTO chart_of_accounts
             (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
           VALUES ($1, $2, $3, $3, $4, $5, 'RECEIVABLE')
           RETURNING id`,
          [req.user.tenantId, accountCode, `ذمة: ${name}`, `Balance: ${name}`, `יתרת: ${name}`]
        );
        const accountId = accountResult.rows[0].id;

        // 2) ننشئ سجل المريض بجدول parties مربوط فورًا بالحساب
        const partyResult = await client.query(
          `INSERT INTO parties (tenant_id, party_type, name, phone, account_id)
           VALUES ($1, 'PATIENT', $2, $3, $4)
           RETURNING id`,
          [req.user.tenantId, name.trim(), phone || null, accountId]
        );

        return { patientId: partyResult.rows[0].id, accountId };
      });

      res.status(201).json({ success: true, ...result });
    } catch (err) {
      console.error('Patient creation failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل المريض' });
    }
  }
);

router.get('/patients', requireAuth, async (req, res) => {
  try {
    const patients = await withTenantClient(req.user.tenantId, async (client) => {
      // الرصيد محسوب مباشرة من القيود (مش عمود مخزّن) — نفس مبدأ
      // getAccountBalance بمحرك المحاسبة، بس هون كـ query مجمّع
      // لكل المرضى دفعة واحدة (أسرع من استدعاء الدالة لكل واحد)
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone, p.account_id,
          COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
        FROM parties p
        LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
        WHERE p.party_type = 'PATIENT'
        GROUP BY p.id, p.name, p.phone, p.account_id
        ORDER BY p.name ASC
      `);
      return result.rows;
    });
    res.json(patients);
  } catch (err) {
    console.error('Fetching patients failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة المرضى' });
  }
});

module.exports = router;
