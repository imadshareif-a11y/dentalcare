-- fix_account_name_nullable.sql
-- -----------------------------------------------------------
-- عمود account_name القديم (قبل دعم اللغات) كان NOT NULL. بعد
-- إضافة account_name_ar/en/he، صار هذا العمود القديم غير مُستخدم
-- بالإدخال، فلازم نلغي شرط الإجبارية عنه حتى ما يمنع إدخال
-- حسابات جديدة.
-- -----------------------------------------------------------

ALTER TABLE chart_of_accounts ALTER COLUMN account_name DROP NOT NULL;
