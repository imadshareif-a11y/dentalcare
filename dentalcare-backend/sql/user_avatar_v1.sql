-- user_avatar_v1.sql — صورة حساب المستخدم
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS avatar_bytes BYTEA;
