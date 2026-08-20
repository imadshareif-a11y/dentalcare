require('dotenv').config();
const { pool } = require('../server/db/pool');

/** إصلاح سريع لقاعدة Railway قبل seed:trial */
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
