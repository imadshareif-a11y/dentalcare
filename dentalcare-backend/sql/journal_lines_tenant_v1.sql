-- journal_lines_tenant_v1.sql
-- أسطر القيد كانت بدون tenant_id، فأي استعلام بدون JOIN على الرأس
-- (أو مع مستخدم Postgres يتجاوز RLS) كان يمكن أن يخلط عيادات.
-- العمود + الـ trigger يمنعان الكتابة عبر العيادات حتى لو المستخدم superuser.

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE journal_entry_lines l
SET tenant_id = e.tenant_id
FROM journal_entries e
WHERE l.journal_entry_id = e.id
  AND l.tenant_id IS NULL;

DELETE FROM journal_entry_lines WHERE tenant_id IS NULL;

ALTER TABLE journal_entry_lines
  ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant
  ON journal_entry_lines (tenant_id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant_account
  ON journal_entry_lines (tenant_id, account_id);

CREATE OR REPLACE FUNCTION prevent_cross_tenant_journal_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  entry_tenant uuid;
  account_tenant uuid;
BEGIN
  SELECT tenant_id INTO entry_tenant
  FROM journal_entries
  WHERE id = NEW.journal_entry_id;

  IF entry_tenant IS NULL THEN
    RAISE EXCEPTION 'القيد المحاسبي غير موجود';
  END IF;

  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := entry_tenant;
  ELSIF NEW.tenant_id IS DISTINCT FROM entry_tenant THEN
    RAISE EXCEPTION 'ممنوع ربط سطر قيد بعيادة مختلفة عن رأس القيد';
  END IF;

  SELECT tenant_id INTO account_tenant
  FROM chart_of_accounts
  WHERE id = NEW.account_id;

  IF account_tenant IS NULL THEN
    RAISE EXCEPTION 'الحساب غير موجود';
  END IF;

  IF account_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'ممنوع استخدام حساب من عيادة أخرى في القيد';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_cross_tenant_journal_line ON journal_entry_lines;
CREATE TRIGGER trg_prevent_cross_tenant_journal_line
  BEFORE INSERT OR UPDATE ON journal_entry_lines
  FOR EACH ROW
  EXECUTE FUNCTION prevent_cross_tenant_journal_line();

CREATE OR REPLACE FUNCTION prevent_journal_entry_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'ممنوع نقل قيد محاسبي إلى عيادة أخرى';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_journal_entry_tenant_change ON journal_entries;
CREATE TRIGGER trg_prevent_journal_entry_tenant_change
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_journal_entry_tenant_change();
