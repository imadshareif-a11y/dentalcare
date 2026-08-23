-- عملة وسعر صرف لكل سطر قيد + المبلغ بعملة الحساب
-- debit/credit تبقى بالعملة الأساسية (المعادل)

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES currencies(id),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS foreign_debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foreign_credit NUMERIC(14, 2) NOT NULL DEFAULT 0;
