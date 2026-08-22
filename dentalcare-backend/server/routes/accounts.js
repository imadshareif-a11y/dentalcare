// routes/accounts.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireClinicContext } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { dedupeChartRows } = require('../accounting/listDedupe');

router.get('/accounts', requireAuth, requireClinicContext, async (req, res) => {
  try {
    const accounts = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.id, a.account_code, a.account_type,
                a.account_name_ar, a.account_name_en, a.account_name_he,
                p.party_type
         FROM chart_of_accounts a
         LEFT JOIN LATERAL (
           SELECT party_type FROM parties p WHERE p.account_id = a.id LIMIT 1
         ) p ON TRUE
         WHERE a.is_active = TRUE
         ORDER BY a.account_code ASC`
      );
      const locale = req.user.locale || 'ar';
      return dedupeChartRows(result.rows.map((row) => ({
        id: row.id,
        account_code: row.account_code,
        account_type: row.account_type,
        party_type: row.party_type || null,
        account_name:
          row[`account_name_${locale}`] ||
          row.account_name_ar ||
          row.account_name_en ||
          row.account_name_he ||
          row.account_code,
      })));
    });
    res.json(accounts);
  } catch (err) {
    console.error('Fetching accounts failed:', err);
    res.status(500).json({ error: 'تعذّر جلب شجرة الحسابات' });
  }
});

module.exports = router;
