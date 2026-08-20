-- إعدادات تحليل الأشعة بالذكاء الاصطناعي (لكل عيادة)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_base_url VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ai_vision_model VARCHAR(120);
