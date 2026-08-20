-- employees_v1.sql
-- ترقيم تلقائي لذمم الموظفين + صلاحية employees

ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS employees_prefix VARCHAR(10) NOT NULL DEFAULT 'E',
    ADD COLUMN IF NOT EXISTS employees_width SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS employees_next INT NOT NULL DEFAULT 1;

-- صلاحيات الموظفين
UPDATE users
SET permissions = permissions || '{"employees":"edit"}'::jsonb
WHERE role = 'OWNER';

UPDATE users
SET permissions = permissions || '{"employees":"edit"}'::jsonb
WHERE role = 'ACCOUNTANT'
  AND COALESCE(permissions->>'employees', 'none') IN ('', 'none');

UPDATE users
SET permissions = permissions || '{"employees":"none"}'::jsonb
WHERE role IN ('DOCTOR', 'RECEPTIONIST')
  AND COALESCE(permissions->>'employees', '') = '';
