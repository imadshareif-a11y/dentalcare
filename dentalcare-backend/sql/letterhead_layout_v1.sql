ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS letterhead_layout JSONB NOT NULL DEFAULT '{}'::jsonb;
