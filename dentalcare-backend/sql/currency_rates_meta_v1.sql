-- currency_rates_meta_v1.sql — وقت آخر تأكيد لأسعار الصرف في العيادة

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS currency_rates_confirmed_at TIMESTAMPTZ;
