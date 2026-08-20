-- tenants_v1_slug.sql
-- رمز عيادة فريد عالميًا — مطلوب لتسجيل الدخول لما أكثر من عيادة
-- تستخدم نفس اسم المستخدم (مثلاً admin).

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS slug VARCHAR(50);

UPDATE tenants
SET slug = 'clinic-' || substr(replace(id::text, '-', ''), 1, 8)
WHERE slug IS NULL;

ALTER TABLE tenants
    ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON tenants (slug);

-- username فريد لمسؤولي المنصة (tenant_id IS NULL) لأن UNIQUE(tenant_id, username)
-- ما بيمنع تكرار NULL في PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS users_platform_username_key
    ON users (username)
    WHERE tenant_id IS NULL;
