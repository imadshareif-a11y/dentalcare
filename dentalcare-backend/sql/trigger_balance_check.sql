-- trigger_balance_check.sql
-- -----------------------------------------------------------
-- خط الدفاع الأخير: حتى لو كان فيه خطأ بمنطق postJournalEntry()
-- بالتطبيق (مثلاً AI عدّل الملف بالمستقبل ونسي التحقق)، قاعدة
-- البيانات نفسها بترفض أي قيد غير متوازن. يشتغل هذا الـ trigger
-- بعد كل عملية على journal_entry_lines (INSERT/UPDATE/DELETE)،
-- ويتأكد إنه مجموع نفس journal_entry_id لسا متوازن.
--
-- CONSTRAINT TRIGGER بيشتغل بآخر الـ transaction (DEFERRED)،
-- يعني بيسمح نضيف الأسطر واحد واحد جوا نفس الـ transaction،
-- وبيتحقق بس لما توصل لـ COMMIT.
-- -----------------------------------------------------------

CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_entry_id UUID;
    v_total_debit NUMERIC(14,2);
    v_total_credit NUMERIC(14,2);
BEGIN
    -- نحدد أي journal_entry_id لازم نتحقق منه (يفرق حسب نوع العملية)
    IF TG_OP = 'DELETE' THEN
        v_entry_id := OLD.journal_entry_id;
    ELSE
        v_entry_id := NEW.journal_entry_id;
    END IF;

    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_total_debit, v_total_credit
    FROM journal_entry_lines
    WHERE journal_entry_id = v_entry_id;

    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION
            'القيد غير متوازن (journal_entry_id=%): مدين=% دائن=% — تم رفض العملية',
            v_entry_id, v_total_debit, v_total_credit;
    END IF;

    RETURN NULL;  -- AFTER trigger، القيمة الراجعة غير مستخدمة
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_journal_balance ON journal_entry_lines;

CREATE CONSTRAINT TRIGGER trg_check_journal_balance
    AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION check_journal_entry_balance();

-- ملاحظة: لأنه journal_entry_lines عادة بتتضاف أسطر متعددة (2+)
-- ضمن نفس الـ INSERT loop قبل ما يتوازن المجموع، الـ DEFERRABLE
-- INITIALLY DEFERRED ضروري — بدونه الـ trigger رح يفشل بعد أول
-- سطر (لسا مش متوازن) قبل ما نوصل للسطر الثاني.
