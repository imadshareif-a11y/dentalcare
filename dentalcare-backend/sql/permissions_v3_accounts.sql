-- permissions_v3_accounts.sql
-- صلاحية قسم الحسابات/العملات

-- المدير: دائمًا صلاحية كاملة على الحسابات والعملات
UPDATE users
SET permissions = permissions || '{"accounts":"edit"}'::jsonb
WHERE role = 'OWNER';

-- المحاسب: يُمنح edit إن لم تُضبط الصلاحية بعد أو كانت none
UPDATE users
SET permissions = permissions || '{"accounts":"edit"}'::jsonb
WHERE role = 'ACCOUNTANT'
  AND COALESCE(permissions->>'accounts', 'none') IN ('', 'none');

-- الطبيب والاستقبال: مخفي افتراضيًا إن لم تُضبط
UPDATE users
SET permissions = permissions || '{"accounts":"none"}'::jsonb
WHERE role IN ('DOCTOR', 'RECEPTIONIST')
  AND COALESCE(permissions->>'accounts', '') = '';
