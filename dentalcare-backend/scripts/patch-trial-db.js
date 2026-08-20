require('dotenv').config();
const { pool } = require('../server/db/pool');

/** إصلاح سريع لقاعدة Railway إذا ناقص max_users / tenant_settings */
async function main() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await pool.query(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER NOT NULL DEFAULT 10
  `);
  await pool.query(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug VARCHAR(50)
  `);
  await pool.query(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_from DATE
  `);
  await pool.query(`
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_until DATE
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      date_format          VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
      currency_symbol      VARCHAR(8) NOT NULL DEFAULT '₪',
      decimal_places       SMALLINT NOT NULL DEFAULT 2,
      thousands_separator  VARCHAR(2) NOT NULL DEFAULT ',',
      decimal_separator    VARCHAR(2) NOT NULL DEFAULT '.',
      print_header_text    TEXT NOT NULL DEFAULT '',
      letterhead_mime      VARCHAR(100),
      letterhead_bytes     BYTEA,
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('DB patch OK — now run: npm run migrate:all && npm run seed:trial');
  await pool.end();
}

main().catch(async (err) => {
  console.error(err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
