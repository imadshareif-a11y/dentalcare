// routes/accounts.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

router.get('/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, account_code, account_type,
                account_name_ar, account_name_en, account_name_he
         FROM chart_of_accounts
         WHERE is_active = TRUE
         ORDER BY account_code ASC`
      );
      // fallback chain: لغة المستخدم → عربي → أي ترجمة موجودة → كود الحساب
      const locale = req.user.locale || 'ar';
      return result.rows.map((row) => ({
        id: row.id,
        account_code: row.account_code,
        account_type: row.account_type,
        account_name:
          row[`account_name_${locale}`] ||
          row.account_name_ar ||
          row.account_name_en ||
          row.account_name_he ||
          row.account_code,
      }));
    });
    res.json(accounts);
  } catch (err) {
    console.error('Fetching accounts failed:', err);
    res.status(500).json({ error: 'تعذّر جلب شجرة الحسابات' });
  }
});

module.exports = router;
