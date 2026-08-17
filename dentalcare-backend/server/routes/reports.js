// routes/reports.js
// -----------------------------------------------------------
// كل التقارير هون قراءة فقط (read-only) — ولا تعديل واحد على
// أي جدول. هاد الملف هو الحل المباشر للمشكلة الأصلية يلي بلّشت
// منها المحادثة: "لما نعمل عرض للكشف، ما بيفتح كشف حساب الذمة
// وبدل هيك بيطلع أرصدة الحسابات كلها". السبب الجذري كان إنه
// الكود ما كان يمرر accountCode/fromDate/toDate فعليًا للاستعلام.
// هون كل route بياخد الفلاتر ويستخدمها فعليًا بالـ WHERE.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');

// نفس منطق fallback chain الموجود بـ routes/accounts.js — موحّد
// هون عشان كل التقارير تحترم لغة المستخدم بنفس الطريقة بالضبط
function resolveAccountName(row, locale) {
  return (
    row[`account_name_${locale}`] ||
    row.account_name_ar ||
    row.account_name_en ||
    row.account_name_he ||
    row.account_code
  );
}

// 1) كشف حساب الذمة المفلتر (Ledger Account Detailed)
router.get('/reports/ledger', requireAuth, async (req, res) => {
  const { accountId, fromDate, toDate } = req.query;

  if (!accountId || !fromDate || !toDate) {
    return res.status(400).json({ error: 'يجب تحديد الحساب وتاريخ البداية والنهاية' });
  }

  try {
    const data = await withTenantClient(req.user.tenantId, async (client) => {
      const accountInfo = await client.query(
        `SELECT account_code, account_name_ar, account_name_en, account_name_he
         FROM chart_of_accounts WHERE id = $1`,
        [accountId]
      );
      if (accountInfo.rows.length === 0) {
        throw new Error('الحساب غير موجود');
      }

      // الرصيد الافتتاحي = كل الحركات *قبل* fromDate
      const openingResult = await client.query(
        `SELECT COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS opening_balance
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         WHERE l.account_id = $1 AND e.entry_date < $2`,
        [accountId, fromDate]
      );
      const openingBalance = Number(openingResult.rows[0].opening_balance);

      // حركات الفترة المحددة فقط — هون بالضبط الفلترة اللي كانت
      // مفقودة بالكود الأصلي
      const movementsResult = await client.query(
        `SELECT e.entry_date, e.memo, l.debit, l.credit, l.line_memo
         FROM journal_entry_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         WHERE l.account_id = $1 AND e.entry_date BETWEEN $2 AND $3
         ORDER BY e.entry_date ASC, e.created_at ASC`,
        [accountId, fromDate, toDate]
      );

      // نحسب الرصيد المتحرك سطر بسطر (running balance)
      let runningBalance = openingBalance;
      const movements = movementsResult.rows.map((row) => {
        runningBalance += Number(row.debit) - Number(row.credit);
        return {
          date: row.entry_date,
          details: row.line_memo || row.memo,
          debit: Number(row.debit),
          credit: Number(row.credit),
          runningBalance,
        };
      });

      return {
        accountName: resolveAccountName(accountInfo.rows[0], req.user.locale || 'ar'),
        openingBalance,
        movements,
        closingBalance: runningBalance,
      };
    });

    res.json(data);
  } catch (err) {
    console.error('Ledger report failed:', err);
    res.status(400).json({ error: err.message || 'تعذّر توليد الكشف' });
  }
});

// 2) ميزان المراجعة (Trial Balance) — كل الحسابات وأرصدتها بتاريخ معيّن
router.get('/reports/trial-balance', requireAuth, async (req, res) => {
  const { asOfDate } = req.query;

  try {
    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      const dateFilter = asOfDate ? `AND e.entry_date <= $2` : '';
      const params = asOfDate ? [req.user.tenantId, asOfDate] : [req.user.tenantId];

      const result = await client.query(
        `SELECT
           a.account_code, a.account_type,
           a.account_name_ar, a.account_name_en, a.account_name_he,
           COALESCE(SUM(l.debit), 0) AS total_debit,
           COALESCE(SUM(l.credit), 0) AS total_credit,
           COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
         FROM chart_of_accounts a
         LEFT JOIN journal_entry_lines l ON l.account_id = a.id
         LEFT JOIN journal_entries e ON e.id = l.journal_entry_id ${dateFilter}
         WHERE a.tenant_id = $1
         GROUP BY a.id, a.account_code, a.account_type,
                  a.account_name_ar, a.account_name_en, a.account_name_he
         ORDER BY a.account_code ASC`,
        params
      );
      const locale = req.user.locale || 'ar';
      return result.rows.map((row) => ({
        account_code: row.account_code,
        account_name: resolveAccountName(row, locale),
        account_type: row.account_type,
        total_debit: row.total_debit,
        total_credit: row.total_credit,
        balance: row.balance,
      }));
    });

    res.json(rows);
  } catch (err) {
    console.error('Trial balance failed:', err);
    res.status(500).json({ error: 'تعذّر توليد ميزان المراجعة' });
  }
});

// 3) قائمة الأرباح والخسائر المفلترة بفترة زمنية
router.get('/reports/profit-loss', requireAuth, async (req, res) => {
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'يجب تحديد الفترة الزمنية' });
  }

  try {
    const data = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT
           a.account_type, a.account_name_ar, a.account_name_en, a.account_name_he, a.account_code,
           COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0) AS net_amount
         FROM chart_of_accounts a
         JOIN journal_entry_lines l ON l.account_id = a.id
         JOIN journal_entries e ON e.id = l.journal_entry_id
         WHERE a.tenant_id = $1
           AND a.account_type IN ('REVENUE', 'EXPENSE')
           AND e.entry_date BETWEEN $2 AND $3
         GROUP BY a.account_type, a.account_code, a.account_name_ar, a.account_name_en, a.account_name_he
         ORDER BY a.account_type, a.account_code`,
        [req.user.tenantId, fromDate, toDate]
      );

      const locale = req.user.locale || 'ar';
      const revenues = result.rows.filter((r) => r.account_type === 'REVENUE');
      const expenses = result.rows.filter((r) => r.account_type === 'EXPENSE');

      const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.net_amount), 0);
      // المصاريف net_amount بتطلع سالبة (لأنها مدين أكثر من دائن)
      // فنقلبها لموجبة للعرض
      const totalExpense = expenses.reduce((sum, r) => sum + Math.abs(Number(r.net_amount)), 0);

      return {
        revenues: revenues.map((r) => ({ name: resolveAccountName(r, locale), amount: Number(r.net_amount) })),
        expenses: expenses.map((r) => ({ name: resolveAccountName(r, locale), amount: Math.abs(Number(r.net_amount)) })),
        totalRevenue,
        totalExpense,
        netProfit: totalRevenue - totalExpense,
      };
    });

    res.json(data);
  } catch (err) {
    console.error('Profit & loss report failed:', err);
    res.status(500).json({ error: 'تعذّر توليد تقرير الأرباح والخسائر' });
  }
});

module.exports = router;
