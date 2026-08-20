-- journal_currency_v1.sql
-- ربط القيود والمستندات بعملة المستند + سعر الصرف لحظة الترحيل.
-- المبالغ في أسطر القيد تُحفظ دائمًا بالعملة الأساس.

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES currencies(id),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1;

ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES currencies(id),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS foreign_amount NUMERIC(14, 2);

-- ربط القيود القديمة بعملة الأساس إن وُجدت
UPDATE journal_entries je
SET currency_id = c.id,
    exchange_rate = 1
FROM currencies c
WHERE c.tenant_id = je.tenant_id
  AND c.is_base = TRUE
  AND je.currency_id IS NULL;
