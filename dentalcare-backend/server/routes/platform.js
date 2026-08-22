// routes/platform.js — مسارات SUPER_ADMIN فقط (بدون tenant)

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { withSystemClient } = require('../db/pool');
const { bootstrapClinic, slugifyClinicName, OWNER_PERMISSIONS } = require('../tenants/bootstrap');
const { purgeTenant, mapDeleteError } = require('../tenants/purgeTenant');
const { parseDateInput, todayUTC, defaultActiveUntil } = require('../tenants/access');

router.use('/platform', requireAuth, requireSuperAdmin);

const TENANT_LIST_SQL = `
  SELECT t.id, t.name, t.slug, t.plan, t.status, t.created_at, t.max_users,
         to_char(t.active_from, 'YYYY-MM-DD') AS active_from,
         to_char(t.active_until, 'YYYY-MM-DD') AS active_until,
         (SELECT COUNT(*)::int FROM users u
           WHERE u.tenant_id = t.id
             AND LOWER(u.username) NOT LIKE 'support.%') AS user_count,
         (SELECT u.username FROM users u
           WHERE u.tenant_id = t.id AND u.role = 'OWNER'
             AND LOWER(u.username) NOT LIKE 'support.%'
           ORDER BY u.created_at ASC LIMIT 1) AS owner_username
  FROM tenants t
`;

function normalizeMaxUsers(value, fallback = 10) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), 500);
}

router.get('/platform/tenants', async (req, res) => {
  try {
    const tenants = await withSystemClient(async (client) => {
      const result = await client.query(`${TENANT_LIST_SQL} ORDER BY t.created_at DESC`);
      return result.rows;
    });
    res.json(tenants);
  } catch (err) {
    console.error('Listing tenants failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة العيادات' });
  }
});

router.post('/platform/tenants', async (req, res) => {
  const {
    name, ownerName, ownerUsername, ownerPassword, activeFrom, activeUntil, maxUsers,
  } = req.body;

  if (!name || !ownerUsername || !ownerPassword) {
    return res.status(400).json({ error: 'اسم العيادة واسم مستخدم المدير وكلمة المرور مطلوبة' });
  }
  if (ownerPassword.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل' });
  }

  try {
    const created = await withSystemClient(async (client) => {
      await client.query('BEGIN');
      try {
        const result = await bootstrapClinic(client, {
          clinicName: name.trim(),
          slug: slugifyClinicName(name),
          ownerName: ownerName?.trim(),
          ownerUsername: ownerUsername.trim(),
          ownerPassword,
          activeFrom,
          activeUntil,
          maxUsers,
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });

    res.status(201).json({ success: true, tenantId: created.tenantId });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'اسم المستخدم هذا مستخدم مسبقًا على المنصة' });
    }
    if (err.message && (err.message.includes('تفعيل') || err.message.includes('تاريخ'))) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Creating tenant failed:', err);
    res.status(500).json({ error: 'تعذّر إنشاء العيادة' });
  }
});

router.patch('/platform/tenants/:id', async (req, res) => {
  const { name, status, activeFrom, activeUntil, maxUsers } = req.body;
  if (!['ACTIVE', 'SUSPENDED'].includes(status) && status != null) {
    return res.status(400).json({ error: 'الحالة يجب أن تكون ACTIVE أو SUSPENDED' });
  }

  const parsedFrom = parseDateInput(activeFrom);
  const parsedUntil = parseDateInput(activeUntil);
  if (parsedFrom === undefined || parsedUntil === undefined) {
    return res.status(400).json({ error: 'تاريخ التفعيل غير صالح' });
  }

  try {
    const updated = await withSystemClient(async (client) => {
      const existing = await client.query(
        `SELECT id, name, status, active_from, active_until, max_users FROM tenants WHERE id = $1`,
        [req.params.id]
      );
      if (existing.rowCount === 0) return null;

      const current = existing.rows[0];
      const nextName = typeof name === 'string' && name.trim() ? name.trim() : current.name;
      const nextStatus = status || current.status;
      const nextFrom = parsedFrom ?? toDateOnlyFallback(current.active_from) ?? todayUTC();
      const nextUntil = parsedUntil ?? toDateOnlyFallback(current.active_until) ?? defaultActiveUntil(nextFrom);
      if (nextUntil < nextFrom) {
        const err = new Error('تاريخ نهاية التفعيل يجب أن يكون بعد تاريخ البداية');
        err.statusCode = 400;
        throw err;
      }
      const nextMaxUsers = maxUsers != null
        ? normalizeMaxUsers(maxUsers, current.max_users || 10)
        : (current.max_users || 10);

      const result = await client.query(
        `UPDATE tenants
         SET name = $1, status = $2, active_from = $3, active_until = $4, max_users = $5
         WHERE id = $6
         RETURNING id, name, status, max_users,
                   to_char(active_from, 'YYYY-MM-DD') AS active_from,
                   to_char(active_until, 'YYYY-MM-DD') AS active_until`,
        [nextName, nextStatus, nextFrom, nextUntil, nextMaxUsers, req.params.id]
      );
      return result.rows[0];
    });

    if (!updated) return res.status(404).json({ error: 'العيادة غير موجودة' });
    res.json({ success: true, tenant: updated });
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    console.error('Updating tenant failed:', err);
    res.status(500).json({ error: 'تعذّر تحديث العيادة' });
  }
});

router.delete('/platform/tenants/:id', async (req, res) => {
  try {
    const deleted = await withSystemClient(async (client) => {
      await client.query('BEGIN');
      try {
        const row = await purgeTenant(client, req.params.id);
        await client.query('COMMIT');
        return row;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    });
    if (!deleted) return res.status(404).json({ error: 'العيادة غير موجودة' });
    res.json({ success: true, tenant: deleted });
  } catch (err) {
    const mapped = mapDeleteError(err);
    if (mapped.statusCode === 409) {
      return res.status(409).json({ error: mapped.message });
    }
    console.error('Deleting tenant failed:', err);
    res.status(500).json({ error: 'تعذّر حذف العيادة' });
  }
});

/** دخول العيادة بصلاحيات كاملة للدعم الفني — بدون كلمة مرور العيادة */
router.post('/platform/tenants/:id/support-access', async (req, res) => {
  try {
    const data = await withSystemClient(async (client) => {
      const tenantResult = await client.query(
        `SELECT id, name, slug, status FROM tenants WHERE id = $1`,
        [req.params.id]
      );
      if (tenantResult.rowCount === 0) return null;
      const tenant = tenantResult.rows[0];
      const supportUsername = `support.${tenant.slug}`.slice(0, 80);

      let userResult = await client.query(
        `SELECT id, name, username, role, locale, permissions
         FROM users
         WHERE tenant_id = $1 AND LOWER(username) = LOWER($2)
         LIMIT 1`,
        [tenant.id, supportUsername]
      );

      if (userResult.rowCount === 0) {
        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        userResult = await client.query(
          `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions, is_active)
           VALUES ($1, $2, $3, $4, 'OWNER', $5, TRUE)
           RETURNING id, name, username, role, locale, permissions`,
          [
            tenant.id,
            `دعم فني — ${tenant.name}`,
            supportUsername,
            passwordHash,
            JSON.stringify(OWNER_PERMISSIONS),
          ]
        );
      } else {
        await client.query(
          `UPDATE users
           SET role = 'OWNER',
               permissions = $1,
               is_active = TRUE,
               name = $2
           WHERE id = $3`,
          [JSON.stringify(OWNER_PERMISSIONS), `دعم فني — ${tenant.name}`, userResult.rows[0].id]
        );
        userResult = await client.query(
          `SELECT id, name, username, role, locale, permissions FROM users WHERE id = $1`,
          [userResult.rows[0].id]
        );
      }

      const supportUser = userResult.rows[0];
      const token = jwt.sign(
        {
          userId: supportUser.id,
          tenantId: tenant.id,
          role: 'OWNER',
          locale: supportUser.locale || 'ar',
          supportMode: true,
          supportAdminId: req.user.userId,
          clinicName: tenant.name,
        },
        process.env.JWT_SECRET,
        { expiresIn: '4h' }
      );

      return {
        token,
        user: {
          id: supportUser.id,
          name: supportUser.name,
          username: supportUser.username,
          role: 'OWNER',
          locale: supportUser.locale || 'ar',
          permissions: supportUser.permissions || OWNER_PERMISSIONS,
          preferences: {},
          supportMode: true,
          clinicName: tenant.name,
        },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      };
    });

    if (!data) return res.status(404).json({ error: 'العيادة غير موجودة' });
    res.json(data);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'تعذّر تجهيز حساب الدعم لهذه العيادة' });
    }
    console.error('Support access failed:', err);
    res.status(500).json({ error: 'تعذّر دخول العيادة للدعم الفني' });
  }
});

// ——— نسخ احتياطي للمنصة ———
router.get('/platform/backups', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { fullBackupDir, tenantBackupDir, backupsRoot } = require('../backup/paths');
    const fullDir = fullBackupDir();
    const tenantDir = tenantBackupDir();

    const listDir = (dir, type) => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter((f) => f.endsWith('.dump') || f.endsWith('.zip'))
        .map((file) => {
          const full = path.join(dir, file);
          const st = fs.statSync(full);
          return {
            file,
            type,
            sizeBytes: st.size,
            modifiedAt: st.mtime.toISOString(),
          };
        });
    };

    let lastRun = null;
    const lastRunPath = path.join(fullDir, 'last-run.json');
    if (fs.existsSync(lastRunPath)) {
      try { lastRun = JSON.parse(fs.readFileSync(lastRunPath, 'utf8')); } catch { /* ignore */ }
    }

    res.json({
      backupsDir: backupsRoot(),
      lastRun,
      keepDays: Number(process.env.BACKUP_KEEP_DAYS) || 14,
      items: [...listDir(fullDir, 'full'), ...listDir(tenantDir, 'tenant')]
        .sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt))),
    });
  } catch (err) {
    console.error('Listing backups failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة النسخ' });
  }
});

router.post('/platform/backups/full', async (req, res) => {
  try {
    const { runFullBackup } = require('../../scripts/ops/run-backup-full');
    const meta = runFullBackup();
    res.status(201).json({ success: true, ...meta });
  } catch (err) {
    console.error('Full backup failed:', err);
    res.status(500).json({ error: err.message || 'تعذّر إنشاء النسخة الكاملة' });
  }
});

router.get('/platform/backups/:fileName/download', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { fullBackupDir, tenantBackupDir, safeBackupFileName } = require('../backup/paths');
    const fileName = safeBackupFileName(req.params.fileName);
    const candidates = [
      path.join(fullBackupDir(), fileName),
      path.join(tenantBackupDir(), fileName),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p));
    if (!filePath) return res.status(404).json({ error: 'الملف غير موجود' });
    res.download(filePath, fileName);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Backup download failed:', err);
    res.status(500).json({ error: 'تعذّر تنزيل النسخة' });
  }
});

router.post('/platform/backups/tenants/:id', async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const { tenantBackupDir } = require('../backup/paths');
    const { buildTenantZipBuffer } = require('../backup/tenantExport');
    const buffer = await buildTenantZipBuffer(req.params.id);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
    const fileName = `tenant-${req.params.id.slice(0, 8)}-${stamp}.zip`;
    const outPath = path.join(tenantBackupDir(), fileName);
    fs.writeFileSync(outPath, buffer);
    res.status(201).json({
      success: true,
      file: fileName,
      sizeBytes: buffer.length,
      modifiedAt: new Date().toISOString(),
      type: 'tenant',
    });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Tenant platform backup failed:', err);
    res.status(500).json({ error: 'تعذّر إنشاء نسخة العيادة' });
  }
});

function toDateOnlyFallback(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

module.exports = router;
