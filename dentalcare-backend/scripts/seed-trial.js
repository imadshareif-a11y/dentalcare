// seed-trial.js — تأسيس سريع لنسخة تجريبية (منصة + عيادة)
// الاستخدام:
//   node scripts/seed-trial.js
// أو عبر env:
//   TRIAL_PLATFORM_USER / TRIAL_PLATFORM_PASSWORD
//   TRIAL_CLINIC_NAME / TRIAL_CLINIC_USER / TRIAL_CLINIC_PASSWORD

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../server/db/pool');
const { bootstrapClinic } = require('../server/tenants/bootstrap');

async function ensurePlatformAdmin(username, password) {
  const existing = await pool.query(
    `SELECT id FROM users WHERE tenant_id IS NULL AND LOWER(username) = LOWER($1)`,
    [username]
  );
  if (existing.rowCount > 0) {
    console.log(`Platform admin already exists: ${username}`);
    return { created: false };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions)
     VALUES (NULL, 'مدير المنصة', $1, $2, 'SUPER_ADMIN', '{}'::jsonb)`,
    [username, passwordHash]
  );
  console.log(`Created platform admin: ${username}`);
  return { created: true };
}

async function ensureClinic(clinicName, ownerUsername, ownerPassword) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const byName = await client.query(
      `SELECT id, slug FROM tenants WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [clinicName]
    );
    if (byName.rowCount > 0) {
      await client.query('COMMIT');
      console.log(`Clinic already exists: ${clinicName} (slug: ${byName.rows[0].slug})`);
      return { created: false, slug: byName.rows[0].slug };
    }

    const created = await bootstrapClinic(client, {
      clinicName,
      ownerUsername,
      ownerPassword,
    });
    await client.query('COMMIT');
    console.log(`Created clinic: ${clinicName}`);
    console.log(`  slug: ${created.slug}`);
    console.log(`  owner: ${ownerUsername}`);
    return { created: true, slug: created.slug };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const platformUser = process.env.TRIAL_PLATFORM_USER || 'platform';
  const platformPassword = process.env.TRIAL_PLATFORM_PASSWORD || 'TrialPlatform1!';
  const clinicName = process.env.TRIAL_CLINIC_NAME || 'عيادة تجريبية';
  const clinicUser = process.env.TRIAL_CLINIC_USER || 'owner';
  const clinicPassword = process.env.TRIAL_CLINIC_PASSWORD || 'TrialOwner1!';

  if (platformPassword.length < 8 || clinicPassword.length < 8) {
    throw new Error('Trial passwords must be at least 8 characters');
  }

  await ensurePlatformAdmin(platformUser, platformPassword);
  const clinic = await ensureClinic(clinicName, clinicUser, clinicPassword);

  console.log('');
  console.log('=== Trial login hints ===');
  console.log(`Platform: leave clinic slug empty, user=${platformUser}`);
  console.log(`Clinic: slug=${clinic.slug}, user=${clinicUser}`);
  console.log('(Change default passwords after first login.)');
}

main()
  .catch((err) => {
    console.error('seed-trial failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
