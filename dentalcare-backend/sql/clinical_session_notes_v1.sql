-- ملاحظات الطبيب على الجلسة السريرية
ALTER TABLE clinical_sessions
  ADD COLUMN IF NOT EXISTS notes TEXT;
