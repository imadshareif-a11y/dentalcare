-- chart_tree_v1.sql
-- هيكل شجرة الحسابات: أب/ابن + حساب تجميعي + ترتيب.

ALTER TABLE chart_of_accounts
    ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_chart_parent
    ON chart_of_accounts (tenant_id, parent_id);

CREATE INDEX IF NOT EXISTS idx_chart_type_code
    ON chart_of_accounts (tenant_id, account_type, account_code);

-- ربط الأبناء بأطول رمز أب (بادئة) من نفس النوع
WITH ranked AS (
  SELECT
    c.id AS child_id,
    p.id AS parent_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.id
      ORDER BY LENGTH(p.account_code) DESC, p.account_code ASC
    ) AS rn
  FROM chart_of_accounts c
  JOIN chart_of_accounts p
    ON p.tenant_id = c.tenant_id
   AND p.account_type = c.account_type
   AND p.id <> c.id
   AND c.account_code ~ '^[0-9]+$'
   AND p.account_code ~ '^[0-9]+$'
   AND LENGTH(p.account_code) < LENGTH(c.account_code)
   AND LEFT(c.account_code, LENGTH(p.account_code)) = p.account_code
  WHERE c.parent_id IS NULL
)
UPDATE chart_of_accounts c
SET parent_id = ranked.parent_id
FROM ranked
WHERE ranked.child_id = c.id
  AND ranked.rn = 1
  AND c.parent_id IS NULL;

-- ترتيب أولي حسب الرمز
UPDATE chart_of_accounts
SET sort_order = CASE
  WHEN account_code ~ '^[0-9]+$' THEN account_code::int
  ELSE 0
END
WHERE sort_order = 0;
