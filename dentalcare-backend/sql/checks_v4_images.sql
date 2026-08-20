-- صور وجه وظهر الشيك (مرفق من مستند القبض أو لاحقًا)
ALTER TABLE checks
  ADD COLUMN IF NOT EXISTS image_front_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS image_front_bytes BYTEA,
  ADD COLUMN IF NOT EXISTS image_back_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS image_back_bytes BYTEA;
