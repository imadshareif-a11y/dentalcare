-- checks_v3_location.sql
-- موقع الشيك الحالي + صندوق/حساب الإيداع برسم التحصيل.

ALTER TABLE checks
    ADD COLUMN IF NOT EXISTS location VARCHAR(30) NOT NULL DEFAULT 'CHECKS_BOX',
    ADD COLUMN IF NOT EXISTS location_account_id UUID REFERENCES chart_of_accounts(id),
    ADD COLUMN IF NOT EXISTS collection_bank_account_id UUID REFERENCES bank_accounts(id),
    ADD COLUMN IF NOT EXISTS deposited_journal_entry_id UUID REFERENCES journal_entries(id);

-- السماح بحالة DEPOSITED (مودع برسم التحصيل)
DO $$
DECLARE
  cons TEXT;
BEGIN
  FOR cons IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'checks'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE checks DROP CONSTRAINT %I', cons);
  END LOOP;
  ALTER TABLE checks
    ADD CONSTRAINT checks_status_check
    CHECK (status IN ('PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'ENDORSED'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ترحيل البيانات الحالية
UPDATE checks
SET location_account_id = COALESCE(location_account_id, holding_account_id)
WHERE location_account_id IS NULL AND holding_account_id IS NOT NULL;

UPDATE checks SET location = 'CHECKS_BOX'
WHERE status = 'PENDING' AND COALESCE(location, 'CHECKS_BOX') = 'CHECKS_BOX';

UPDATE checks SET location = 'BANK_CURRENT'
WHERE status = 'CLEARED';

UPDATE checks SET location = 'BOUNCED'
WHERE status = 'BOUNCED';

UPDATE checks SET location = 'ENDORSED'
WHERE status = 'ENDORSED';

-- إن وُجدت شيكات معلّقة على حساب برسم تحصيل بنكي، علّمها DEPOSITED
UPDATE checks c
SET location = 'BANK_COLLECTION',
    status = CASE WHEN c.status = 'PENDING' THEN 'DEPOSITED' ELSE c.status END
FROM bank_accounts ba
WHERE ba.chart_account_id = c.location_account_id
  AND ba.account_kind = 'COLLECTION'
  AND c.status IN ('PENDING', 'DEPOSITED');
