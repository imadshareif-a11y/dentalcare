-- numbering_v1.sql
-- ترقيم تلقائي للذمم + عنوان وملاحظات طبية للمريض + حساب رصيد مدور

ALTER TABLE parties
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS medical_notes TEXT;

ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS patients_prefix VARCHAR(10) NOT NULL DEFAULT 'C',
    ADD COLUMN IF NOT EXISTS patients_width SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS patients_next INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS suppliers_prefix VARCHAR(10) NOT NULL DEFAULT 'S',
    ADD COLUMN IF NOT EXISTS suppliers_width SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS suppliers_next INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS doctors_prefix VARCHAR(10) NOT NULL DEFAULT 'D',
    ADD COLUMN IF NOT EXISTS doctors_width SMALLINT NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS doctors_next INT NOT NULL DEFAULT 1;

INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
SELECT t.id, '3100', 'رصيد مدور', 'رصيد مدور', 'Brought Forward', 'יתרה מועברת', 'EQUITY'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts a WHERE a.tenant_id = t.id AND a.account_code = '3100'
);
