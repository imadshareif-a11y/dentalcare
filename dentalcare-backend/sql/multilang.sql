-- multilang.sql
-- -----------------------------------------------------------
-- ملاحظة تصميم مهمة: أسماء المرضى (parties.name) ما بتتغيّر —
-- عمود واحد بس، بدون ترجمة، لحماية دقة تعريف هوية المريض.
-- فقط الكيانات "المعرّفة مسبقًا والمحدودة العدد" (شجرة الحسابات،
-- كتالوج العلاجات لاحقًا) بتاخد أعمدة ترجمة، لأنها بتترجم مرة
-- وحدة يدويًا من قبل مدير العيادة، مش آليًا.
-- -----------------------------------------------------------

-- 1) لغة تفضيلية لكل مستخدم — الواجهة بتفتح بيها تلقائيًا
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NOT NULL DEFAULT 'ar';

-- 2) ترجمة أسماء الحسابات
ALTER TABLE chart_of_accounts
    ADD COLUMN IF NOT EXISTS account_name_ar VARCHAR(255),
    ADD COLUMN IF NOT EXISTS account_name_en VARCHAR(255),
    ADD COLUMN IF NOT EXISTS account_name_he VARCHAR(255);

UPDATE chart_of_accounts SET account_name_ar = account_name WHERE account_name_ar IS NULL;
