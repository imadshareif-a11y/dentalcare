-- doctors_v1.sql
-- -----------------------------------------------------------
-- الطبيب = "ذمة" بالضبط متل المريض والمورد: سطر بجدول parties
-- (party_type='DOCTOR') مربوط بحساب التزام (LIABILITY) بشجرة
-- الحسابات — لأننا نحن المدينون له، مش هو المدين لنا.
-- جدول doctors منفصل بيحمل بس معلومات التعويض الخاصة فيه.
-- -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS doctors (
    party_id            UUID PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    compensation_type   VARCHAR(20) NOT NULL
        CHECK (compensation_type IN ('SALARY', 'PERCENTAGE', 'PARTNER')),
    percentage_rate     NUMERIC(5,2),  -- مثلاً 30.00 يعني %30 — يُستخدم فقط لو PERCENTAGE
    monthly_salary      NUMERIC(12,2) -- يُستخدم فقط لو SALARY (مرجعي، الدفع الفعلي بسند صرف يدوي)
);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_doctors ON doctors;
CREATE POLICY tenant_isolation_doctors ON doctors
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- حساب مصروف "عمولات الأطباء" — لازم يكون موجود بشجرة حسابات كل
-- عيادة عشان تتحسب فيه عمولات النسبة تلقائيًا. الإدراج هون آمن
-- للتكرار (ما بيكرر الحساب لو موجود مسبقًا) وبيغطي العيادات
-- الموجودة حاليًا بدون حاجة لحذف بياناتها وإعادة التأسيس
INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
SELECT t.id, '5100', 'عمولات الأطباء', 'عمولات الأطباء', 'Doctor Commissions', 'עמלות רופאים', 'EXPENSE'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts a WHERE a.tenant_id = t.id AND a.account_code = '5100'
);
