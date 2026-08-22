// db/ensureTenantSettings.js — يضمن كل أعمدة tenant_settings (تُشغَّل عند كل إقلاع — آمنة)

const { pool } = require('./pool');

let ensured = false;

/** كل الأعمدة التي يقرأها SETTINGS_SELECT / SETTINGS_RETURNING */
const ENSURE_TENANT_SETTINGS_SQL = `
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS patients_prefix VARCHAR(10) NOT NULL DEFAULT 'C',
  ADD COLUMN IF NOT EXISTS patients_width SMALLINT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS patients_next INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS suppliers_prefix VARCHAR(10) NOT NULL DEFAULT 'S',
  ADD COLUMN IF NOT EXISTS suppliers_width SMALLINT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS suppliers_next INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS doctors_prefix VARCHAR(10) NOT NULL DEFAULT 'D',
  ADD COLUMN IF NOT EXISTS doctors_width SMALLINT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS doctors_next INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS employees_prefix VARCHAR(10) NOT NULL DEFAULT 'E',
  ADD COLUMN IF NOT EXISTS employees_width SMALLINT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS employees_next INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
  ADD COLUMN IF NOT EXISTS ai_base_url VARCHAR(255),
  ADD COLUMN IF NOT EXISTS ai_vision_model VARCHAR(120),
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(40) NOT NULL DEFAULT 'openai',
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
  ADD COLUMN IF NOT EXISTS wa_auto_payment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS currency_rates_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS role_permission_defaults JSONB;

DROP POLICY IF EXISTS tenant_isolation_settings ON tenant_settings;
CREATE POLICY tenant_isolation_settings ON tenant_settings
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);
`;

async function ensureTenantSettingsSchema() {
  if (ensured) return;
  await pool.query(ENSURE_TENANT_SETTINGS_SQL);
  ensured = true;
}

module.exports = { ensureTenantSettingsSchema };
