-- user_preferences_v1.sql
-- تفضيلات لكل مستخدم (أزرار الوصول السريع في المفضل).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
