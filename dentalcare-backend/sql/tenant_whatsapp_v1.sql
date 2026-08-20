-- tenant_whatsapp_v1.sql — إعدادات واتساب + سجل الرسائل
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS wa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_provider VARCHAR(40) NOT NULL DEFAULT 'compatible',
  ADD COLUMN IF NOT EXISTS wa_api_token TEXT,
  ADD COLUMN IF NOT EXISTS wa_phone_number_id VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wa_base_url VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wa_default_country VARCHAR(8) NOT NULL DEFAULT '972',
  ADD COLUMN IF NOT EXISTS wa_template_appointment VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wa_template_reminder VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wa_template_payment VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wa_template_balance VARCHAR(120),
  ADD COLUMN IF NOT EXISTS wa_auto_appointment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_auto_reminder BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wa_auto_payment BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id    UUID REFERENCES parties(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  kind          VARCHAR(40) NOT NULL,
  to_phone      VARCHAR(32) NOT NULL,
  body_preview  TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  provider_ref  VARCHAR(120),
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_tenant
  ON whatsapp_messages(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_dedupe
  ON whatsapp_messages(tenant_id, kind, appointment_id, status);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_whatsapp_messages ON whatsapp_messages;
CREATE POLICY tenant_isolation_whatsapp_messages ON whatsapp_messages
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
