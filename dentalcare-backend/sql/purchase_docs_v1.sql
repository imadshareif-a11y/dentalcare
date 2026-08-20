-- purchase_docs_v1.sql
-- حسابات المشتريات والخصم لكل العيادات الموجودة والجديدة.

INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
SELECT t.id, '5200', 'المشتريات', 'المشتريات', 'Purchases', 'רכש', 'EXPENSE'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts a WHERE a.tenant_id = t.id AND a.account_code = '5200'
);

INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
SELECT t.id, '5300', 'الخصم المسموح به', 'الخصم المسموح به', 'Sales discounts allowed', 'הנחה מותרת', 'EXPENSE'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts a WHERE a.tenant_id = t.id AND a.account_code = '5300'
);

INSERT INTO chart_of_accounts (tenant_id, account_code, account_name, account_name_ar, account_name_en, account_name_he, account_type)
SELECT t.id, '4200', 'الخصم المكتسب', 'الخصم المكتسب', 'Purchase discounts earned', 'הנחה שהושגה', 'REVENUE'
FROM tenants t
WHERE NOT EXISTS (
    SELECT 1 FROM chart_of_accounts a WHERE a.tenant_id = t.id AND a.account_code = '4200'
);
