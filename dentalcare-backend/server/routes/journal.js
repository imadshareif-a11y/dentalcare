// routes/journal.js
// -----------------------------------------------------------
// يغطي حالتين طلبتهم بالمحادثة الأصلية:
// 1) قيد تسوية مفتوح الأطراف (من أي حساب/ذمة إلى أي حساب/ذمة)
// 2) قيد مركّب (Multi-Leg) بعدد غير محدود من الأسطر
// كلاهما نفس الشكل فعليًا — الفرق بس عدد الأسطر. القيد الافتتاحي
// حالة خاصة منفصلة تحت لأنها بتحتاج صلاحية أعلى (OWNER فقط).
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');

// يغطي كلا الحالتين: تسوية بسيطة (سطرين) أو قيد مركّب (أكثر من سطرين)
router.post(
  '/journal-entries',
  requireAuth,
  requireRole(['OWNER', 'ACCOUNTANT']),
  async (req, res) => {
    const { lines, memo } = req.body;

    if (!Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ error: 'القيد يجب أن يحتوي على سطرين على الأقل' });
    }

    // تحقق من شكل كل سطر قبل ما نوصل لمحرك المحاسبة
    for (const line of lines) {
      if (!line.accountId) {
        return res.status(400).json({ error: 'كل سطر يجب أن يحدد حساب' });
      }
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'JOURNAL',
        memo,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          lineMemo: l.lineMemo,
        })),
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        // هون بالذات محتمل يوصل فعليًا (على عكس سند القبض/الصرف)
        // لأنه المستخدم بيدخل الأرقام يدويًا بكل سطر
        return res.status(400).json({
          error: err.message,
          totalDebit: err.totalDebit,
          totalCredit: err.totalCredit,
        });
      }
      console.error('Journal entry posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل القيد، يرجى المحاولة لاحقًا' });
    }
  }
);

// القيد الافتتاحي: صلاحية OWNER فقط — لأنه بيضبط أرصدة تأسيسية
// حساسة (رأس المال، أرصدة الذمم السابقة) وما بنبغى يصير اعتيادي
router.post(
  '/opening-balance',
  requireAuth,
  requireRole(['OWNER']),
  async (req, res) => {
    const { equityAccountId, lines, memo } = req.body;
    // lines هون = أرصدة الذمم الافتتاحية (كل واحدة مدين على حساب
    // الذمة)، وبيتوازن الكل بقيد دائن واحد على حساب رأس المال

    if (!equityAccountId || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'يجب تحديد حساب رأس المال وقائمة الأرصدة الافتتاحية' });
    }

    const totalOpeningBalances = lines.reduce((sum, l) => sum + Number(l.balance || 0), 0);
    if (totalOpeningBalances <= 0) {
      return res.status(400).json({ error: 'مجموع الأرصدة الافتتاحية يجب أن يكون أكبر من صفر' });
    }

    try {
      const { journalEntryId } = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'OPENING',
        memo: memo || 'قيد افتتاحي',
        lines: [
          ...lines.map((l) => ({
            accountId: l.accountId,
            debit: Number(l.balance),
            lineMemo: 'رصيد افتتاحي',
          })),
          { accountId: equityAccountId, credit: totalOpeningBalances },
        ],
      });
      res.status(201).json({ success: true, journalEntryId });
    } catch (err) {
      if (err instanceof UnbalancedEntryError) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Opening balance posting failed:', err);
      res.status(500).json({ error: 'تعذّر ترحيل القيد الافتتاحي' });
    }
  }
);

module.exports = router;
