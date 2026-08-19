-- permissions_v0_add_column.sql
-- -----------------------------------------------------------
-- يضيف عمود الصلاحيات لجدول users على قواعد بيانات موجودة.
-- شغّله مرة واحدة قبل permissions_v1.sql
-- -----------------------------------------------------------

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
