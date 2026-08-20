ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(40) NOT NULL DEFAULT 'openai';
