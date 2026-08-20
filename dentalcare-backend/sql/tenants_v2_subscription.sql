-- tenants_v2_subscription.sql
-- فترة تفعيل العيادة + اسم مستخدم فريد عالميًا حتى يكفي الدخول
-- باسم المستخدم وكلمة المرور بدون رمز عيادة.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS active_from DATE,
    ADD COLUMN IF NOT EXISTS active_until DATE;

UPDATE tenants
SET active_from = COALESCE(active_from, (created_at AT TIME ZONE 'UTC')::date),
    active_until = COALESCE(active_until, ((created_at AT TIME ZONE 'UTC')::date + INTERVAL '1 year')::date)
WHERE active_from IS NULL OR active_until IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_global_key
    ON users (LOWER(username));
