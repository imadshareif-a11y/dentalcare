-- حد أقصى لمستخدمي العيادة (غير حساب الدعم الفني)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10;

UPDATE tenants
SET max_users = 10
WHERE max_users IS NULL OR max_users < 1;
