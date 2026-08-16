-- checks_v2.sql
-- -----------------------------------------------------------
-- يوسّع جدول checks الموجود أصلًا بالـ schema، عشان يدعم دورة
-- حياة الشيك الكاملة: PENDING (بالحافظة) → CLEARED (تحصّل
-- بالبنك) أو BOUNCED (ارتجع).
-- -----------------------------------------------------------

ALTER TABLE checks
    ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS holding_account_id UUID REFERENCES chart_of_accounts(id),
    ADD COLUMN IF NOT EXISTS check_type VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
        CHECK (check_type IN ('RECEIVED', 'ISSUED')),
    ADD COLUMN IF NOT EXISTS cleared_journal_entry_id UUID REFERENCES journal_entries(id),
    ADD COLUMN IF NOT EXISTS endorsed_journal_entry_id UUID REFERENCES journal_entries(id);

-- endorsed_journal_entry_id: لما شيك مقبوض (RECEIVED) يُظهَّر (يُعطى
-- مباشرة لمورد بدل تحصيله بالبنك) — status بيصير 'ENDORSED'

-- holding_account_id = حساب "حافظة الشيكات" يلي انسجّل فيه الشيك
-- أول مرة (مش البنك مباشرة) — لازم نعرفه وقت "التحصيل" أو
-- "الارتجاع" عشان نعرف من وين نطلع الفلوس بالقيد العكسي/التحصيل
