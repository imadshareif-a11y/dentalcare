-- ============================================================
-- DentalCare Cloud — Core Database Schema (Multi-Tenant)
-- ============================================================
-- المبادئ الأساسية:
-- 1) كل جدول فيه بيانات عيادة معينة لازم يحتوي tenant_id
-- 2) Row-Level Security (RLS) تفرض العزل على مستوى القاعدة نفسها،
--    مش بس على مستوى كود الـ backend — هاي حماية إضافية حتى لو
--    نسي المطوّر (أو الـ AI) شرط WHERE tenant_id = ...
-- 3) القيود المحاسبية (journal_entries) ثابتة لا تُعدَّل أبدًا بعد
--    الترحيل — أي تصحيح = قيد عكسي جديد (زي المحاسبة الحقيقية)
-- ============================================================


-- ============================================================
-- 1) TENANTS — العيادات (المستأجرين)
-- ============================================================
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    plan            VARCHAR(50) NOT NULL DEFAULT 'TRIAL',   -- TRIAL / PRO / ENTERPRISE
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / SUSPENDED / CANCELLED
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 2) USERS — المستخدمين (يتبعون لعيادة واحدة، عدا Super Admin منصّة)
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE CASCADE,
    -- tenant_id = NULL فقط لمستخدم Super Admin على مستوى المنصّة كلها
    name            VARCHAR(255) NOT NULL,
    username        VARCHAR(100) NOT NULL,
    password_hash   TEXT NOT NULL,        -- bcrypt hash فعلي — لا كلمات مرور نصية أبدًا
    role            VARCHAR(50) NOT NULL, -- OWNER / DOCTOR / ACCOUNTANT / RECEPTIONIST / SUPER_ADMIN
    permissions     JSONB NOT NULL DEFAULT '{}'::jsonb, -- none/view/edit لكل قسم
    locale          VARCHAR(5) NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar', 'en', 'he')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, username)  -- اسم المستخدم فريد ضمن نفس العيادة، مش عالميًا
);

CREATE INDEX idx_users_tenant ON users(tenant_id);


-- ============================================================
-- 3) PARTIES — الأطراف الموحّدة (مريض / مورد / موظف...)
-- ============================================================
-- بدل ما يكون "المريض" و"الذمة" جدولين منفصلين لازم نربطهم يدويًا
-- (وهاد بالضبط اللي كان بيتكسر بمشروعك مع Gemini)، نوحّدهم من
-- التصميم: كل "طرف" هو سطر واحد بجدول parties، وكل طرف له
-- حساب واحد بشجرة الحسابات تلقائيًا. هيك "التوحيد" مش قاعدة
-- بالكود لازم نتذكرها، هو بنية البيانات نفسها.
CREATE TABLE parties (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    party_type      VARCHAR(20) NOT NULL,  -- PATIENT / SUPPLIER / EMPLOYEE
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    account_id      UUID,  -- FK لـ chart_of_accounts (يُضاف بعد تعريفه تحت)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_parties_tenant ON parties(tenant_id);


-- ============================================================
-- 4) CHART OF ACCOUNTS — شجرة الحسابات
-- ============================================================
CREATE TABLE chart_of_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_code    VARCHAR(50) NOT NULL,
    account_name    VARCHAR(255) NOT NULL,
    account_type    VARCHAR(20) NOT NULL,  -- ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE
    parent_id       UUID REFERENCES chart_of_accounts(id),  -- لدعم شجرة فرعية
    party_id        UUID REFERENCES parties(id),  -- إذا هذا الحساب = ذمة طرف معيّن
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (tenant_id, account_code)
);

CREATE INDEX idx_accounts_tenant ON chart_of_accounts(tenant_id);

-- الآن نربط parties.account_id فعليًا بعد ما الجدول موجود
ALTER TABLE parties
    ADD CONSTRAINT fk_parties_account
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);


-- ============================================================
-- 5) JOURNAL ENTRIES — القيود المحاسبية (رأس القيد)
-- ============================================================
-- هذا الجدول ثابت (Append-Only). ممنوع UPDATE أو DELETE على أي
-- صف فيه بعد الترحيل. أي تصحيح = قيد جديد بعكس الاتجاه.
CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type     VARCHAR(30) NOT NULL,  -- RECEIPT / PAYMENT / JOURNAL / OPENING / CLINICAL_SESSION
    source_ref_id   UUID,          -- ربط اختياري بمصدر العملية (مثلاً جلسة سريرية)
    memo            TEXT,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reversed_by     UUID REFERENCES journal_entries(id)  -- لو هذا القيد أُلغي بقيد عكسي، بيشاور عليه
);

CREATE INDEX idx_journal_tenant_date ON journal_entries(tenant_id, entry_date);


-- ============================================================
-- 6) JOURNAL ENTRY LINES — سطور القيد (مدين/دائن)
-- ============================================================
-- القاعدة الذهبية اللي بتفرض نفسها هون: مجموع debit = مجموع
-- credit ضمن نفس journal_entry_id — هاي القاعدة لازم تتحقق
-- بمستوى الـ application (transaction واحدة) قبل الترحيل،
-- مش بعده.
CREATE TABLE journal_entry_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id    UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id          UUID NOT NULL REFERENCES chart_of_accounts(id),
    debit               NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    credit              NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    line_memo           TEXT,
    CHECK (debit >= 0 AND credit >= 0),
    CHECK (NOT (debit > 0 AND credit > 0))  -- سطر واحد ما بيكون فيه مدين ودائن مع بعض
);

CREATE INDEX idx_lines_account ON journal_entry_lines(account_id);
CREATE INDEX idx_lines_entry ON journal_entry_lines(journal_entry_id);

-- ملاحظة مهمة: ما في عمود "balance" مخزّن بجدول chart_of_accounts.
-- الرصيد الحالي لأي حساب = SUM(debit) - SUM(credit) من هذا الجدول
-- (أو العكس حسب نوع الحساب). هيك الرصيد دايمًا حقيقة مشتقة من
-- القيود نفسها، مش رقم منفصل ممكن يختلف عن مجموع الحركات.
-- (تفصيل هذا الحساب وطريقة تسريعه بـ view أو cache — بنغطيه
-- بالخطوة الجاية لما نبني الـ API فوق هالجداول.)


-- ============================================================
-- 7) CHECKS — حافظة الشيكات (مرتبطة بسطر قيد معيّن)
-- ============================================================
CREATE TABLE checks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    journal_entry_id    UUID NOT NULL REFERENCES journal_entries(id),
    check_number        VARCHAR(50) NOT NULL,
    bank_name           VARCHAR(255) NOT NULL,
    due_date            DATE NOT NULL,
    drawer_name         VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'  -- PENDING / CLEARED / BOUNCED
);

CREATE INDEX idx_checks_tenant ON checks(tenant_id);


-- ============================================================
-- ROW-LEVEL SECURITY — العزل بين العيادات على مستوى القاعدة
-- ============================================================
-- الفكرة: كل اتصال بقاعدة البيانات (من الـ backend) بيحدد
-- tenant_id الحالي أول شي بالـ session، وبعدها PostgreSQL نفسه
-- بيرفض إرجاع أي صف من عيادة تانية — حتى لو استعلام الـ backend
-- نسي شرط WHERE. هاي طبقة حماية إضافية فوق كود التطبيق، مش بديل
-- عنه.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_parties ON parties
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_accounts ON chart_of_accounts
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

CREATE POLICY tenant_isolation_journal ON journal_entries
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- journal_entry_lines ما فيه tenant_id مباشرة (لتجنب تكرار البيانات)،
-- فبنعزلها عن طريق العلاقة مع journal_entries
CREATE POLICY tenant_isolation_lines ON journal_entry_lines
    USING (journal_entry_id IN (
        SELECT id FROM journal_entries
        WHERE tenant_id = current_setting('app.current_tenant')::UUID
    ));

CREATE POLICY tenant_isolation_checks ON checks
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- بالـ backend: أول شي بكل request (بعد التحقق من JWT)، لازم تنفّذ:
--   SET app.current_tenant = '<tenant_id من التوكن>';
-- قبل أي استعلام تاني بنفس الـ connection/transaction.
