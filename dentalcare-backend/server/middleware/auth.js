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
    // payload المتوقع: { userId, tenantId, role }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'جلسة الدخول غير صالحة أو منتهية' });
  }
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

module.exports = { requireAuth, requireRole };
