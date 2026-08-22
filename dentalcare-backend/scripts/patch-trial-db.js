require('dotenv').config();
const { pool } = require('../server/db/pool');

/** إصلاح سريع لقاعدة Railway قبل seed:trial — جداول/أعمدة أساسية ناقصة */
async function main() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  const stmts = [
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(50)`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_from DATE`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_until DATE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS locale VARCHAR(5) NOT NULL DEFAULT 'ar'`,
    `ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_ar VARCHAR(255)`,
    `ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_en VARCHAR(255)`,
    `ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_he VARCHAR(255)`,
    `UPDATE chart_of_accounts SET account_name_ar = account_name WHERE account_name_ar IS NULL`,
    `CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
      currency_symbol VARCHAR(8) NOT NULL DEFAULT '₪',
      decimal_places SMALLINT NOT NULL DEFAULT 2,
      thousands_separator VARCHAR(2) NOT NULL DEFAULT ',',
      decimal_separator VARCHAR(2) NOT NULL DEFAULT '.',
      print_header_text TEXT NOT NULL DEFAULT '',
      letterhead_mime VARCHAR(100),
      letterhead_bytes BYTEA,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS treatment_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS currencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code VARCHAR(10) NOT NULL,
      name VARCHAR(120) NOT NULL,
      name_en VARCHAR(120),
      name_he VARCHAR(120),
      symbol VARCHAR(16) NOT NULL,
      decimal_places SMALLINT NOT NULL DEFAULT 2,
      rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1,
      is_base BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, code)
    )`,
    `CREATE TABLE IF NOT EXISTS cash_boxes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      currency_id UUID NOT NULL REFERENCES currencies(id) ON DELETE CASCADE,
      box_kind VARCHAR(20) NOT NULL CHECK (box_kind IN ('CASH', 'CHECKS_IN', 'CHECKS_OUT')),
      name VARCHAR(160) NOT NULL,
      name_en VARCHAR(160),
      name_he VARCHAR(160),
      account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, account_id)
    )`,
    `CREATE TABLE IF NOT EXISTS banks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      bank_number VARCHAR(20) NOT NULL,
      name VARCHAR(160) NOT NULL,
      name_en VARCHAR(160),
      name_he VARCHAR(160),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, bank_number)
    )`,
    `CREATE TABLE IF NOT EXISTS bank_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      bank_id UUID REFERENCES banks(id) ON DELETE SET NULL,
      account_kind VARCHAR(20) NOT NULL
        CHECK (account_kind IN ('CURRENT', 'COLLECTION', 'PAYMENT', 'SAVINGS')),
      name VARCHAR(160) NOT NULL,
      name_en VARCHAR(160),
      name_he VARCHAR(160),
      account_number VARCHAR(60),
      currency_id UUID REFERENCES currencies(id) ON DELETE SET NULL,
      chart_account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, chart_account_id)
    )`,
    `CREATE TABLE IF NOT EXISTS checkbooks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
      serial_from VARCHAR(50) NOT NULL,
      serial_to VARCHAR(50) NOT NULL,
      next_serial VARCHAR(50) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS checkbooks_tenant_account_idx
      ON checkbooks (tenant_id, bank_account_id)`,
    `ALTER TABLE checks ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id)`,
    `ALTER TABLE checks ADD COLUMN IF NOT EXISTS checkbook_id UUID REFERENCES checkbooks(id)`,
    `ALTER TABLE checkbooks ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS tenant_isolation_checkbooks ON checkbooks`,
    `CREATE POLICY tenant_isolation_checkbooks ON checkbooks
      USING (tenant_id = current_setting('app.current_tenant')::UUID)
      WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID)`,
    `ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS currency_rates_confirmed_at TIMESTAMPTZ`,
  ];
  for (const sql of stmts) {
    try {
      await pool.query(sql);
    } catch (err) {
      console.warn('skip:', err.message);
    }
  }
  console.log('DB patch OK — next: npm run migrate:all && npm run seed:trial');
  await pool.end();
}

main().catch(async (err) => {
  console.error(err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
