// db/pool.js
// -----------------------------------------------------------
// نقطة اتصال واحدة بقاعدة البيانات لكل الـ backend.
// أهم دالة هون: withTenantClient — أي عملية بتلمس بيانات عيادة
// معينة *لازم* تمر من خلالها، لأنها هي يلي بتفعّل الـ tenant
// context (SET LOCAL app.current_tenant) قبل أي استعلام، وهيك
// الـ Row-Level Security بقاعدة البيانات بتصير فعّالة تلقائيًا.
// -----------------------------------------------------------

const { Pool } = require('pg');

function buildPoolConfig() {
  const connectionString = process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim();
  if (connectionString) {
    const config = {
      connectionString,
      max: Number(process.env.DB_POOL_MAX) || 20,
    };
    // Railway / managed Postgres غالبًا يحتاج SSL
    if (process.env.DB_SSL === '0' || process.env.DB_SSL === 'false') {
      config.ssl = false;
    } else if (
      process.env.DB_SSL === '1'
      || process.env.DB_SSL === 'true'
      || /railway\.app|render\.com|amazonaws\.com|neon\.tech|supabase\.co/i.test(connectionString)
    ) {
      config.ssl = { rejectUnauthorized: false };
    }
    return config;
  }

  return {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'dentalcare',
    password: process.env.DB_PASSWORD || 'postgres',
    port: process.env.DB_PORT || 5432,
    max: Number(process.env.DB_POOL_MAX) || 20,
  };
}

const pool = new Pool(buildPoolConfig());

/**
 * ينفّذ دالة (callback) ضمن transaction واحدة، بعد ما يحدد
 * tenant_id الحالي بجلسة الاتصال. أي استعلام جوا callback بيتقيّد
 * تلقائيًا بـ RLS policies يلي عملناها بالـ schema.
 *
 * @param {string} tenantId - UUID العيادة الحالية (من الـ JWT)
 * @param {(client: import('pg').PoolClient) => Promise<any>} callback
 */
async function withTenantClient(tenantId, callback) {
  if (!tenantId) {
    throw new Error('withTenantClient requires a tenantId — never call without one.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // SET LOCAL بدل SET العادي: القيمة بتنطبق بس على هاي الـ
    // transaction، وبتنمسح تلقائيًا بعد COMMIT/ROLLBACK. هيك
    // ما فيه احتمال "تسريب" tenant_id لاتصال تاني من الـ pool.
    await client.query(`SET LOCAL app.current_tenant = '${tenantId}'`);

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * للعمليات يلي مش مرتبطة بعيادة معينة (مثلاً: تسجيل دخول Super
 * Admin، أو إنشاء عيادة جديدة). استخدامها المباشر لأي بيانات
 * عيادة = خطأ يجب تجنبه دايمًا.
 */
async function withSystemClient(callback) {
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

module.exports = { pool, withTenantClient, withSystemClient, buildPoolConfig };
