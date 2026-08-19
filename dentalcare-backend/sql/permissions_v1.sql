-- permissions_v1.sql
-- -----------------------------------------------------------
-- المستخدمون الموجودون حاليًا (admin، وأي مستخدم عملته قبل هالخطوة)
-- عمودهم permissions لسا فاضي ('{}'). هاد بيعبّيه بالصلاحيات
-- الافتراضية المناسبة لدور كل واحد فيهم (بنظام 3 مستويات:
-- none/view/edit)، بدون ما نحتاج نمسح ونعيد تأسيس العيادة.
-- -----------------------------------------------------------

UPDATE users SET permissions = '{
  "clinical": "edit", "receipts": "edit", "payments": "edit", "journal": "edit",
  "openingBalance": "edit", "patients": "edit", "doctors": "edit", "checks": "edit",
  "reports": "view", "users": "edit"
}'::jsonb
WHERE role = 'OWNER' AND permissions = '{}'::jsonb;

UPDATE users SET permissions = '{
  "clinical": "none", "receipts": "edit", "payments": "edit", "journal": "edit",
  "openingBalance": "none", "patients": "edit", "doctors": "view", "checks": "edit",
  "reports": "view", "users": "none"
}'::jsonb
WHERE role = 'ACCOUNTANT' AND permissions = '{}'::jsonb;

UPDATE users SET permissions = '{
  "clinical": "edit", "receipts": "none", "payments": "none", "journal": "none",
  "openingBalance": "none", "patients": "view", "doctors": "none", "checks": "none",
  "reports": "view", "users": "none"
}'::jsonb
WHERE role = 'DOCTOR' AND permissions = '{}'::jsonb;

UPDATE users SET permissions = '{
  "clinical": "none", "receipts": "edit", "payments": "none", "journal": "none",
  "openingBalance": "none", "patients": "edit", "doctors": "none", "checks": "view",
  "reports": "view", "users": "none"
}'::jsonb
WHERE role = 'RECEPTIONIST' AND permissions = '{}'::jsonb;
