// routes/accounts.js
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

router.get('/accounts', requireAuth, async (req, res) => {
  try {
    const accounts = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, account_code, account_name, account_type
         FROM chart_of_accounts
         WHERE is_active = TRUE
         ORDER BY account_code ASC`
      );
      return result.rows;
    });
    res.json(accounts);
  } catch (err) {
    console.error('Fetching accounts failed:', err);
    res.status(500).json({ error: 'تعذّر جلب شجرة الحسابات' });
  }
});

module.exports = router;
