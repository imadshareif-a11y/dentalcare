-- number_digits_v1.sql — ترميز عرض الأرقام (غربي / هندي شرقي)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS number_digits VARCHAR(16) NOT NULL DEFAULT 'western';
