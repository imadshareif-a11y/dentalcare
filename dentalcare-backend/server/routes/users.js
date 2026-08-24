// routes/users.js
// -----------------------------------------------------------
// *** كل route هون requireRole(['OWNER']) صراحة، مش
// requirePermission() ***. هاد قرار أمان متعمّد: لو سمحنا لصلاحية
// قابلة للتخصيص تتحكم بـ"مين يقدر يعدّل صلاحيات مين"، ممكن مستخدم
// غير-مدير يوصله صلاحية "users" بالغلط (أو بقرار إداري) ويعطي
// نفسه صلاحيات أعلى منه — تصعيد صلاحيات. هاي القاعدة الوحيدة يلي
// بتضل مقفولة بالكود دايمًا، مش قابلة للتخصيص من أي واجهة.
// -----------------------------------------------------------

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth, requireRole, requireClinicContext } = require('../middleware/auth');
const { withTenantClient, withSystemClient } = require('../db/pool');
const { assertUsernameAvailable } = require('../tenants/bootstrap');
const { ensureUserDoctorLinkSchema } = require('../db/ensureUserDoctorLink');
const {
  VALID_ROLES,
  PERMISSION_KEYS,
  VALID_LEVELS,
  BUILTIN_DEFAULTS,
  sanitizePermissionsOverride,
  sanitizeRoleDefaultsMap,
  mergeTenantDefaults,
} = require('../permissions/defaults');

async function validateDoctorPartyLink(client, tenantId, doctorPartyId) {
  if (doctorPartyId == null || doctorPartyId === '') return null;
  const result = await client.query(
    `SELECT p.id
     FROM parties p
     JOIN doctors d ON d.party_id = p.id AND d.tenant_id = p.tenant_id
     WHERE p.id = $1 AND p.tenant_id = $2 AND p.party_type = 'DOCTOR'`,
    [doctorPartyId, tenantId]
  );
  if (result.rowCount === 0) {
    const err = new Error('الطبيب المختار غير موجود في هذه العيادة');
    err.statusCode = 400;
    throw err;
  }
  return doctorPartyId;
}

async function loadRoleDefaults(tenantId) {
  return withTenantClient(tenantId, async (client) => {
    const result = await client.query(
      `SELECT role_permission_defaults FROM tenant_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    return mergeTenantDefaults(result.rows[0]?.role_permission_defaults);
  });
}

router.get('/permission-defaults', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    const defaults = await loadRoleDefaults(req.user.tenantId);
    res.json({
      keys: PERMISSION_KEYS,
      levels: VALID_LEVELS,
      roles: VALID_ROLES,
      defaults,
      builtin: BUILTIN_DEFAULTS,
    });
  } catch (err) {
    console.error('Loading permission defaults failed:', err);
    res.status(500).json({ error: 'تعذّر جلب صلاحيات الأدوار الافتراضية' });
  }
});

router.put('/permission-defaults', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const clean = sanitizeRoleDefaultsMap(req.body?.defaults || req.body);
  try {
    const saved = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [req.user.tenantId]
      );
      const result = await client.query(
        `UPDATE tenant_settings
         SET role_permission_defaults = $2::jsonb, updated_at = now()
         WHERE tenant_id = $1
         RETURNING role_permission_defaults`,
        [req.user.tenantId, JSON.stringify(clean)]
      );
      return mergeTenantDefaults(result.rows[0]?.role_permission_defaults);
    });
    res.json({
      success: true,
      keys: PERMISSION_KEYS,
      levels: VALID_LEVELS,
      roles: VALID_ROLES,
      defaults: saved,
      builtin: BUILTIN_DEFAULTS,
    });
  } catch (err) {
    console.error('Saving permission defaults failed:', err);
    res.status(500).json({ error: 'تعذّر حفظ صلاحيات الأدوار الافتراضية' });
  }
});

router.post(
  '/permission-defaults/reset',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  async (req, res) => {
    try {
      const saved = await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
          [req.user.tenantId]
        );
        const result = await client.query(
          `UPDATE tenant_settings
           SET role_permission_defaults = NULL, updated_at = now()
           WHERE tenant_id = $1
           RETURNING role_permission_defaults`,
          [req.user.tenantId]
        );
        return mergeTenantDefaults(result.rows[0]?.role_permission_defaults);
      });
      res.json({
        success: true,
        keys: PERMISSION_KEYS,
        levels: VALID_LEVELS,
        roles: VALID_ROLES,
        defaults: saved,
        builtin: BUILTIN_DEFAULTS,
      });
    } catch (err) {
      console.error('Resetting permission defaults failed:', err);
      res.status(500).json({ error: 'تعذّر استعادة الافتراضيات' });
    }
  }
);

router.post(
  '/users',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  async (req, res) => {
    const { name, username, password, role, permissions, doctorPartyId } = req.body;

    if (!name || !username || !password) {
      return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: 'دور غير صالح' });
    }

    try {
      await ensureUserDoctorLinkSchema();
      const roleDefaults = await loadRoleDefaults(req.user.tenantId);
      const finalPermissions = {
        ...roleDefaults[role],
        ...sanitizePermissionsOverride(permissions),
      };

      await withSystemClient(async (client) => {
        await assertUsernameAvailable(client, username.trim());
      });
      const passwordHash = await bcrypt.hash(password, 10);
      const userId = await withTenantClient(req.user.tenantId, async (client) => {
        const limits = await client.query(
          `SELECT t.max_users,
                  (SELECT COUNT(*)::int FROM users u
                    WHERE u.tenant_id = t.id
                      AND LOWER(u.username) NOT LIKE 'support.%') AS user_count
           FROM tenants t
           WHERE t.id = $1`,
          [req.user.tenantId]
        );
        const maxUsers = Number(limits.rows[0]?.max_users) || 10;
        const userCount = Number(limits.rows[0]?.user_count) || 0;
        if (userCount >= maxUsers) {
          const err = new Error(`تم بلوغ الحد الأقصى للمستخدمين لهذه العيادة (${maxUsers})`);
          err.statusCode = 400;
          throw err;
        }

        const linkedDoctorId = role === 'DOCTOR'
          ? await validateDoctorPartyLink(client, req.user.tenantId, doctorPartyId)
          : null;
        if (role === 'DOCTOR' && !linkedDoctorId) {
          const err = new Error('يجب اختيار الطبيب المرتبط بحساب المستخدم');
          err.statusCode = 400;
          throw err;
        }

        const result = await client.query(
          `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions, doctor_party_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [req.user.tenantId, name.trim(), username.trim(), passwordHash, role, JSON.stringify(finalPermissions), linkedDoctorId]
        );
        return result.rows[0].id;
      });

      res.status(201).json({ success: true, userId, permissions: finalPermissions });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err.code === '23505') {
        if (String(err.constraint || '').includes('doctor_party')) {
          return res.status(409).json({ error: 'هذا الطبيب مربوط بمستخدم آخر في العيادة' });
        }
        return res.status(409).json({ error: 'اسم المستخدم هذا مستخدم مسبقًا' });
      }
      console.error('User creation failed:', err);
      res.status(500).json({ error: 'تعذّر إنشاء المستخدم' });
    }
  }
);

router.get(
  '/users',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  async (req, res) => {
    try {
      const users = await withTenantClient(req.user.tenantId, async (client) => {
        await ensureUserDoctorLinkSchema();
        const result = await client.query(
          `SELECT u.id, u.name, u.username, u.role, u.is_active, u.permissions,
                  u.doctor_party_id, dp.name AS doctor_name
           FROM users u
           LEFT JOIN parties dp ON dp.id = u.doctor_party_id AND dp.tenant_id = u.tenant_id
           WHERE u.tenant_id = $1 AND u.role <> 'SUPER_ADMIN'
             AND LOWER(u.username) NOT LIKE 'support.%'
           ORDER BY u.name ASC`,
          [req.user.tenantId]
        );
        return result.rows;
      });
      res.json(users);
    } catch (err) {
      console.error('Fetching users failed:', err);
      res.status(500).json({ error: 'تعذّر جلب قائمة المستخدمين' });
    }
  }
);

router.patch(
  '/users/:id',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  async (req, res) => {
    const { id } = req.params;
    const { doctorPartyId, isActive } = req.body;
    const wantsDoctor = doctorPartyId !== undefined;
    const wantsActive = typeof isActive === 'boolean';

    if (!wantsDoctor && !wantsActive) {
      return res.status(400).json({ error: 'لم يتم إرسال بيانات للتحديث' });
    }

    try {
      await ensureUserDoctorLinkSchema();
      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, role, is_active FROM users
           WHERE id = $1 AND tenant_id = $2 AND role <> 'SUPER_ADMIN'
             AND LOWER(username) NOT LIKE 'support.%'`,
          [id, req.user.tenantId]
        );
        const userRow = existing.rows[0];
        if (!userRow) return null;

        if (wantsActive) {
          if (String(id) === String(req.user.userId) && isActive === false) {
            const err = new Error('لا يمكن إيقاف حسابك الحالي أثناء تسجيل الدخول');
            err.statusCode = 400;
            throw err;
          }
          if (userRow.role === 'OWNER' && isActive === false) {
            const owners = await client.query(
              `SELECT COUNT(*)::int AS c FROM users
               WHERE tenant_id = $1 AND role = 'OWNER' AND is_active = TRUE
                 AND role <> 'SUPER_ADMIN'
                 AND LOWER(username) NOT LIKE 'support.%'`,
              [req.user.tenantId]
            );
            if (Number(owners.rows[0]?.c) <= 1 && userRow.is_active) {
              const err = new Error('لا يمكن إيقاف آخر مالك نشط للعيادة');
              err.statusCode = 400;
              throw err;
            }
          }
          await client.query(
            `UPDATE users SET is_active = $1
             WHERE id = $2 AND tenant_id = $3`,
            [isActive, id, req.user.tenantId]
          );
        }

        if (wantsDoctor) {
          let linkedDoctorId = null;
          if (doctorPartyId) {
            linkedDoctorId = await validateDoctorPartyLink(client, req.user.tenantId, doctorPartyId);
            if (userRow.role !== 'DOCTOR') {
              const err = new Error('ربط الطبيب متاح فقط لمستخدمي دور «طبيب»');
              err.statusCode = 400;
              throw err;
            }
          }
          await client.query(
            `UPDATE users SET doctor_party_id = $1
             WHERE id = $2 AND tenant_id = $3`,
            [linkedDoctorId, id, req.user.tenantId]
          );
        }

        const result = await client.query(
          `SELECT id, is_active, doctor_party_id FROM users
           WHERE id = $1 AND tenant_id = $2`,
          [id, req.user.tenantId]
        );
        return result.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'المستخدم غير موجود' });
      res.json({
        success: true,
        isActive: updated.is_active,
        doctorPartyId: updated.doctor_party_id,
      });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err.code === '23505') {
        return res.status(409).json({ error: 'هذا الطبيب مربوط بمستخدم آخر في العيادة' });
      }
      console.error('User update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث المستخدم' });
    }
  }
);

router.delete(
  '/users/:id',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  async (req, res) => {
    const { id } = req.params;

    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({ error: 'لا يمكن حذف حسابك الحالي' });
    }

    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, role FROM users
           WHERE id = $1 AND tenant_id = $2 AND role <> 'SUPER_ADMIN'
             AND LOWER(username) NOT LIKE 'support.%'`,
          [id, req.user.tenantId]
        );
        if (existing.rowCount === 0) {
          const err = new Error('المستخدم غير موجود');
          err.statusCode = 404;
          throw err;
        }
        const userRow = existing.rows[0];
        if (userRow.role === 'OWNER') {
          const owners = await client.query(
            `SELECT COUNT(*)::int AS c FROM users
             WHERE tenant_id = $1 AND role = 'OWNER' AND is_active = TRUE
               AND LOWER(username) NOT LIKE 'support.%'`,
            [req.user.tenantId]
          );
          if (Number(owners.rows[0]?.c) <= 1) {
            const err = new Error('لا يمكن حذف آخر مالك للعيادة');
            err.statusCode = 400;
            throw err;
          }
        }

        await client.query(
          `DELETE FROM users WHERE id = $1 AND tenant_id = $2`,
          [id, req.user.tenantId]
        );
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23503') {
        return res.status(400).json({
          error: 'لا يمكن حذف المستخدم لوجود بيانات مرتبطة به — أوقفه بدل الحذف',
        });
      }
      console.error('User delete failed:', err);
      res.status(500).json({ error: 'تعذّر حذف المستخدم' });
    }
  }
);

router.patch(
  '/users/:id/permissions',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  async (req, res) => {
    const { id } = req.params;
    const clean = sanitizePermissionsOverride(req.body.permissions);

    if (Object.keys(clean).length === 0) {
      return res.status(400).json({ error: 'لم يتم إرسال أي صلاحية صالحة للتعديل' });
    }

    try {
      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `UPDATE users SET permissions = permissions || $1::jsonb
           WHERE id = $2 AND tenant_id = $3 AND role <> 'SUPER_ADMIN'
           RETURNING id, permissions`,
          [JSON.stringify(clean), id, req.user.tenantId]
        );
        return result.rows[0] || null;
      });

      if (!updated) return res.status(404).json({ error: 'المستخدم غير موجود' });
      res.json({ success: true, permissions: updated.permissions });
    } catch (err) {
      console.error('Permission update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث الصلاحيات' });
    }
  }
);

module.exports = router;
