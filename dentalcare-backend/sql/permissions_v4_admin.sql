-- permissions_v4_admin.sql
-- صلاحية اللوحة الإدارية (مراقبة الحركات، المواعيد، المؤشرات)

UPDATE users
SET permissions = permissions || '{"admin":"edit"}'::jsonb
WHERE role = 'OWNER'
  AND COALESCE(permissions->>'admin', '') = '';

UPDATE users
SET permissions = permissions || '{"admin":"view"}'::jsonb
WHERE role IN ('ACCOUNTANT', 'RECEPTIONIST')
  AND COALESCE(permissions->>'admin', '') = '';

UPDATE users
SET permissions = permissions || '{"admin":"none"}'::jsonb
WHERE role = 'DOCTOR'
  AND COALESCE(permissions->>'admin', '') = '';

UPDATE users
SET permissions = permissions || '{"admin":"none"}'::jsonb
WHERE COALESCE(permissions->>'admin', '') = '';
