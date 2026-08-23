-- عملة الحساب في دليل الحسابات والذمم

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES currencies(id);

UPDATE chart_of_accounts a
SET currency_id = cb.currency_id
FROM cash_boxes cb
WHERE cb.account_id = a.id
  AND a.currency_id IS NULL;

UPDATE chart_of_accounts a
SET currency_id = ba.currency_id
FROM bank_accounts ba
WHERE ba.chart_account_id = a.id
  AND a.currency_id IS NULL;

-- تصحيح: حسابات الصناديق/البنوك تتبع عملة الربط وليس الأساس
UPDATE chart_of_accounts a
SET currency_id = cb.currency_id
FROM cash_boxes cb
WHERE cb.account_id = a.id
  AND cb.is_active = TRUE
  AND a.currency_id IS DISTINCT FROM cb.currency_id;

UPDATE chart_of_accounts a
SET currency_id = ba.currency_id
FROM bank_accounts ba
WHERE ba.chart_account_id = a.id
  AND ba.is_active = TRUE
  AND ba.currency_id IS NOT NULL
  AND a.currency_id IS DISTINCT FROM ba.currency_id;

UPDATE chart_of_accounts a
SET currency_id = c.id
FROM currencies c
WHERE c.tenant_id = a.tenant_id
  AND c.is_base = TRUE
  AND a.currency_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_currency
  ON chart_of_accounts (tenant_id, currency_id);
