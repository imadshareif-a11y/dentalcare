// routes/accounts.js
const express = require('express');
const router = express.Router();
const { requireAuth, requireClinicContext, requireAnyPermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { dedupeChartRows } = require('../accounting/listDedupe');
const { displayBalance } = require('../accounting/balanceDisplay');

const VOUCHER_CONTEXT = requireAnyPermission([
  ['receipts', 'view'],
  ['receipts', 'edit'],
  ['payments', 'view'],
  ['payments', 'edit'],
  ['journal', 'view'],
  ['journal', 'edit'],
]);

function resolveAccountName(row, locale) {
  return row[`account_name_${locale}`]
    || row.account_name_ar
    || row.account_name_en
    || row.account_name_he
    || row.account_code;
}

function mapPickerRow(row, locale) {
  return {
    id: row.id,
    accountId: row.id,
    accountCode: row.account_code,
    accountType: row.account_type,
    partyType: row.party_type || null,
    partyName: row.party_name || null,
    accountName: resolveAccountName(row, locale),
    balance: displayBalance(row.account_type, row.total_debit, row.total_credit),
  };
}

router.get('/accounts', requireAuth, requireClinicContext, async (req, res) => {
  try {
    const accounts = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.id, a.account_code, a.account_type,
                a.account_name_ar, a.account_name_en, a.account_name_he,
                p.party_type,
                COALESCE(c_cb.id, c_ba.id, c_acct.id, c_base.id) AS currency_id,
                COALESCE(c_cb.code, c_ba.code, c_acct.code, c_base.code) AS currency_code,
                COALESCE(c_cb.symbol, c_ba.symbol, c_acct.symbol, c_base.symbol) AS currency_symbol,
                COALESCE(c_cb.rate_to_base, c_ba.rate_to_base, c_acct.rate_to_base, c_base.rate_to_base, 1) AS exchange_rate
         FROM chart_of_accounts a
         LEFT JOIN LATERAL (
           SELECT party_type FROM parties p WHERE p.account_id = a.id AND p.tenant_id = a.tenant_id LIMIT 1
         ) p ON TRUE
         LEFT JOIN cash_boxes cb ON cb.account_id = a.id AND cb.tenant_id = a.tenant_id AND cb.is_active = TRUE
         LEFT JOIN currencies c_cb ON c_cb.id = cb.currency_id AND c_cb.tenant_id = a.tenant_id
         LEFT JOIN bank_accounts ba ON ba.chart_account_id = a.id AND ba.tenant_id = a.tenant_id AND ba.is_active = TRUE
         LEFT JOIN currencies c_ba ON c_ba.id = ba.currency_id AND c_ba.tenant_id = a.tenant_id
         LEFT JOIN currencies c_acct ON c_acct.id = a.currency_id AND c_acct.tenant_id = a.tenant_id
         LEFT JOIN currencies c_base ON c_base.tenant_id = a.tenant_id AND c_base.is_base = TRUE
         WHERE a.tenant_id = $1 AND a.is_active = TRUE
         ORDER BY a.account_code ASC`,
        [req.user.tenantId]
      );
      const locale = req.user.locale || 'ar';
      return dedupeChartRows(result.rows.map((row) => ({
        id: row.id,
        account_code: row.account_code,
        account_type: row.account_type,
        party_type: row.party_type || null,
        currency_id: row.currency_id || null,
        currency_code: row.currency_code || null,
        currency_symbol: row.currency_symbol || null,
        exchange_rate: row.exchange_rate != null ? Number(row.exchange_rate) : 1,
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

router.get('/accounts/picker', requireAuth, requireClinicContext, VOUCHER_CONTEXT, async (req, res) => {
  const scope = req.query.scope === 'extended' ? 'extended' : 'party';
  const locale = req.user.locale || 'ar';

  try {
    const data = await withTenantClient(req.user.tenantId, async (client) => {
      const partiesResult = await client.query(`
        SELECT
          a.id, a.account_code, a.account_type,
          a.account_name_ar, a.account_name_en, a.account_name_he,
          p.party_type, p.name AS party_name,
          COALESCE(SUM(l.debit), 0) AS total_debit,
          COALESCE(SUM(l.credit), 0) AS total_credit
        FROM chart_of_accounts a
        INNER JOIN parties p ON p.account_id = a.id
        LEFT JOIN journal_entry_lines l ON l.account_id = a.id
        WHERE a.is_active = TRUE
        GROUP BY a.id, a.account_code, a.account_type,
                 a.account_name_ar, a.account_name_en, a.account_name_he,
                 p.party_type, p.name
        ORDER BY p.party_type ASC, p.name ASC
      `);

      const parties = dedupeChartRows(partiesResult.rows)
        .map((row) => mapPickerRow(row, locale));

      let others = [];
      if (scope === 'extended') {
        const othersResult = await client.query(`
          SELECT
            a.id, a.account_code, a.account_type,
            a.account_name_ar, a.account_name_en, a.account_name_he,
            NULL::varchar AS party_type, NULL::text AS party_name,
            COALESCE(SUM(l.debit), 0) AS total_debit,
            COALESCE(SUM(l.credit), 0) AS total_credit
          FROM chart_of_accounts a
          LEFT JOIN parties p ON p.account_id = a.id
          LEFT JOIN journal_entry_lines l ON l.account_id = a.id
          WHERE a.is_active = TRUE
            AND p.id IS NULL
            AND a.account_type IN ('EXPENSE', 'REVENUE', 'ASSET')
          GROUP BY a.id, a.account_code, a.account_type,
                   a.account_name_ar, a.account_name_en, a.account_name_he
          ORDER BY a.account_code ASC
        `);
        others = dedupeChartRows(othersResult.rows)
          .map((row) => mapPickerRow(row, locale));
      }

      return { parties, others };
    });

    res.json(data);
  } catch (err) {
    console.error('Account picker failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة الحسابات' });
  }
});

router.get('/accounts/:accountId/voucher-context', requireAuth, requireClinicContext, VOUCHER_CONTEXT, async (req, res) => {
  const { accountId } = req.params;

  try {
    const data = await withTenantClient(req.user.tenantId, async (client) => {
      const accountResult = await client.query(
        `SELECT a.id, a.account_code, a.account_type,
                a.account_name_ar, a.account_name_en, a.account_name_he,
                p.party_type, p.name AS party_name
         FROM chart_of_accounts a
         LEFT JOIN parties p ON p.account_id = a.id
         WHERE a.id = $1 AND a.is_active = TRUE`,
        [accountId]
      );
      if (accountResult.rowCount === 0) {
        throw Object.assign(new Error('الحساب غير موجود'), { statusCode: 404 });
      }
      const account = accountResult.rows[0];
      const locale = req.user.locale || 'ar';

      const balanceResult = await client.query(
        `SELECT COALESCE(SUM(l.debit), 0) AS total_debit,
                COALESCE(SUM(l.credit), 0) AS total_credit
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         WHERE l.account_id = $1`,
        [accountId]
      );
      const { total_debit: totalDebit, total_credit: totalCredit } = balanceResult.rows[0];

      const lastReceiptResult = await client.query(
        `SELECT to_char(MAX(je.entry_date), 'YYYY-MM-DD') AS last_receipt_date
         FROM journal_entries je
         JOIN journal_entry_lines l ON l.journal_entry_id = je.id
         WHERE je.tenant_id = $1
           AND je.source_type = 'RECEIPT'
           AND l.account_id = $2`,
        [req.user.tenantId, accountId]
      );

      return {
        accountId: account.id,
        accountCode: account.account_code,
        accountType: account.account_type,
        partyType: account.party_type || null,
        partyName: account.party_name || null,
        accountName:
          account[`account_name_${locale}`]
          || account.account_name_ar
          || account.account_name_en
          || account.account_name_he
          || account.account_code,
        balance: displayBalance(account.account_type, totalDebit, totalCredit),
        lastReceiptDate: lastReceiptResult.rows[0]?.last_receipt_date || null,
      };
    });

    res.json(data);
  } catch (err) {
    if (err.statusCode === 404) return res.status(404).json({ error: err.message });
    console.error('Account voucher context failed:', err);
    res.status(500).json({ error: 'تعذّر جلب معلومات الذمة' });
  }
});

module.exports = router;
