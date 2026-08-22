-- time_format_v1.sql — نظام عرض الوقت (12 ساعة / 24 ساعة)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS time_format VARCHAR(8) NOT NULL DEFAULT '12h';
