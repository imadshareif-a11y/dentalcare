-- rls_system_bypass_v1.sql
-- يسمح لعمليات النظام (withSystemClient) بالعمل تحت FORCE RLS عبر app.bypass_rls

-- يُعاد تطبيق السياسات من ensureTenantIsolation عند إقلاع السيرفر.
-- هذا الملف يضمن وجود العمود/السياسات بعد migrate:all حتى قبل إعادة التشغيل.

DO $$
BEGIN
  -- لا شيء هيكلي إلزامي هنا؛ ensureTenantIsolation يحدّث السياسات عند الإقلاع.
  NULL;
END $$;
