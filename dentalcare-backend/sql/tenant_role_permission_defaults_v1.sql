-- tenant_role_permission_defaults_v1.sql
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS role_permission_defaults JSONB;
