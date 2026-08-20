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
const {
  VALID_ROLES,
  PERMISSION_KEYS,
  VALID_LEVELS,
  BUILTIN_DEFAULTS,
  sanitizePermissionsOverride,
  sanitizeRoleDefaultsMap,
  mergeTenantDefaults,
} = require('../permissions/defaults');

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
    const { name, username, password, role, permissions } = req.body;

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

        const result = await client.query(
          `INSERT INTO users (tenant_id, name, username, password_hash, role, permissions)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [req.user.tenantId, name.trim(), username.trim(), passwordHash, role, JSON.stringify(finalPermissions)]
        );
        return result.rows[0].id;
      });

      res.status(201).json({ success: true, userId, permissions: finalPermissions });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      if (err.code === '23505') {
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
        const result = await client.query(
          `SELECT id, name, username, role, is_active, permissions
           FROM users
           WHERE tenant_id = $1 AND role <> 'SUPER_ADMIN'
             AND LOWER(username) NOT LIKE 'support.%'
           ORDER BY name ASC`,
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
