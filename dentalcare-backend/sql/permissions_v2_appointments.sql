-- permissions_v2_appointments.sql
-- صلاحية مستقلة للمواعيد: الاستقبال يحجز بدون ترحيل جلسات سريرية.
-- من لديه clinical=edit يُمنح appointments=edit إن لم تكن موجودة.

UPDATE users
SET permissions = permissions || '{"appointments":"edit"}'::jsonb
WHERE COALESCE(permissions->>'appointments', '') = ''
  AND COALESCE(permissions->>'clinical', 'none') = 'edit';

UPDATE users
SET permissions = permissions || '{"appointments":"edit"}'::jsonb
WHERE role = 'RECEPTIONIST'
  AND COALESCE(permissions->>'appointments', 'none') IN ('', 'none');

UPDATE users
SET permissions = permissions || '{"appointments":"none"}'::jsonb
WHERE COALESCE(permissions->>'appointments', '') = ''
  AND role = 'ACCOUNTANT';
