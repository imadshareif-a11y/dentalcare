-- مرفق صورة/ملف للمستند المحاسبي (فاتورة مشتريات وغيرها)
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS attachment_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS attachment_bytes BYTEA;
