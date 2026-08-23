// middleware/auth.js
// -----------------------------------------------------------
// تحقق حقيقي من هوية المستخدم — بدون أي "قبول أي باسورد" زي
// اللي كان بآخر نسخة من مشروعك مع Gemini. هاد أول باب دخول
// لأي طلب، وبيفشل بوضوح لو التوكن غير صالح.
// -----------------------------------------------------------

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // ما منسمح للسيرفر يشتغل بدون secret حقيقي — هاي غلطة أمنية
  // شائعة (الاعتماد على قيمة افتراضية مكتوبة بالكود).
  throw new Error('JWT_SECRET environment variable is required.');
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'مطلوب تسجيل دخول' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;

    if (!payload.sessionId) {
      return next();
    }

    const { pool } = require('../db/pool');
    const { isSessionActive, touchSession } = require('../services/userSessions');

    isSessionActive(pool, payload.sessionId).then((active) => {
      if (!active) {
        return res.status(401).json({ error: 'انتهت الجلسة أو تم تسجيل الخروج' });
      }
      touchSession(pool, payload.sessionId).catch(() => {});
      return next();
    }).catch((err) => {
      console.error('Session check failed:', err);
      res.status(500).json({ error: 'تعذّر التحقق من الجلسة' });
    });
  } catch (err) {
    return res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'هذه العملية مخصصة لمدير المنصة' });
  }
  next();
}

/**
 * أي مسار يلمس بيانات عيادة: لازم tenantId بالتوكن، والعيادة ACTIVE.
 * يمنع SUPER_ADMIN من لمس بيانات عيادية بالغلط عبر /api/accounts وغيرها.
 */
function requireClinicContext(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(403).json({ error: 'هذه العملية مخصصة لحسابات العيادات' });
  }

  // جلسة الدعم الفني من مدير المنصة: السماح حتى لو العيادة موقوفة للمساعدة
  if (req.user.supportMode) {
    return next();
  }

  const { withSystemClient } = require('../db/pool');
  withSystemClient(async (client) => {
    const result = await client.query(
      `SELECT u.tenant_id, u.is_active,
              t.status, t.active_from, t.active_until
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [req.user.userId]
    );
    const row = result.rows[0];
    if (!row || String(row.tenant_id) !== String(req.user.tenantId)) {
      return { denied: 'حسابك غير مرتبط بهذه العيادة — سجّل الدخول من جديد' };
    }
    if (!row.is_active) {
      return { denied: 'حسابك غير نشط' };
    }
    return { tenant: row };
  }).then((out) => {
    if (out?.denied) return res.status(403).json({ error: out.denied });

    if (req.user.supportMode) {
      return next();
    }

    const { clinicAccessDeniedReason } = require('../tenants/access');
    const denied = clinicAccessDeniedReason(out.tenant);
    if (denied) return res.status(403).json({ error: denied });
    next();
  }).catch((err) => {
    console.error('Clinic context check failed:', err);
    res.status(500).json({ error: 'تعذّر التحقق من العيادة' });
  });
}

/**
 * middleware إضافي: يتحقق إنه دور المستخدم من ضمن الأدوار
 * المسموحة للـ route. مثال استخدام:
 *   router.post('/vouchers', requireAuth, requireRole(['OWNER','ACCOUNTANT']), handler)
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
    }
    next();
  };
}

/**
 * التحقق الفعلي من مستوى صلاحية فردي مخزّن بعمود
 * users.permissions (JSONB) — كل قسم إله مستوى مستقل من
 * ثلاثة: 'none' (مخفي) / 'view' (مشاهدة بس) / 'edit' (كامل).
 * بيُقرأ من قاعدة البيانات مباشرة بكل طلب — قصدًا، مش من
 * التوكن — عشان أي تعديل صلاحيات من المدير يصير نافذ فورًا.
 *
 * مثال استخدام:
 *   requirePermission('receipts', 'edit')   // لازم صلاحية كاملة
 *   requirePermission('patients', 'view')   // مشاهدة تكفي (edit كمان بتحقق الشرط)
 */
const PERMISSION_LEVEL_RANK = { none: 0, view: 1, edit: 2 };

function requirePermission(key, minLevel = 'edit') {
  return requireAnyPermission([[key, minLevel]]);
}

function requireAnyPermission(requirements) {
  return (req, res, next) => {
    requireClinicContext(req, res, async () => {
      try {
        const { withTenantClient } = require('../db/pool');
        const perms = await withTenantClient(req.user.tenantId, async (client) => {
          const result = await client.query(
            'SELECT permissions FROM users WHERE id = $1 AND tenant_id = $2',
            [req.user.userId, req.user.tenantId]
          );
          return result.rows[0]?.permissions || {};
        });
        const hasEnough = requirements.some(([key, minLevel]) => {
          const level = perms[key] || 'none';
          return (PERMISSION_LEVEL_RANK[level] || 0) >= (PERMISSION_LEVEL_RANK[minLevel] || 0);
        });
        if (!hasEnough) {
          return res.status(403).json({ error: 'ليس لديك صلاحية لهذه العملية' });
        }
        next();
      } catch (err) {
        console.error('Permission check failed:', err);
        res.status(500).json({ error: 'تعذّر التحقق من الصلاحيات' });
      }
    });
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requirePermission,
  requireAnyPermission,
  requireSuperAdmin,
  requireClinicContext,
};
