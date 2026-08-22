// app.js
// -----------------------------------------------------------
// نقطة الدخول — بس تجميع، بلا أي منطق أعمال هون. لو لاحظت AI
// عم يقترح يضيف منطق محاسبي أو استعلام قاعدة بيانات مباشرة
// بهاد الملف، هاي إشارة إنه رجع لنفس نمط "كل شي بملف واحد".
// -----------------------------------------------------------

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'dentalcare' });
});

app.use('/api', require('./routes/auth'));           // POST /api/auth/login
app.use('/api', require('./routes/accounts'));       // GET  /api/accounts
app.use('/api', require('./routes/vouchers'));      // POST /api/receipts
app.use('/api', require('./routes/payments'));      // POST /api/payments
app.use('/api', require('./routes/purchases'));
app.use('/api', require('./routes/notes'));
app.use('/api', require('./routes/journal'));        // POST /api/journal-entries, /api/opening-balance
app.use('/api', require('./routes/bankEntries'));
app.use('/api', require('./routes/clinical'));       // POST /api/clinical/commit-session
app.use('/api', require('./routes/appointments'));
app.use('/api', require('./routes/whatsapp'));
app.use('/api', require('./routes/patients'));       // POST+GET /api/patients
app.use('/api', require('./routes/suppliers'));
app.use('/api', require('./routes/reports'));        // GET /api/reports/*
app.use('/api', require('./routes/checks'));          // GET/POST /api/checks/*
app.use('/api', require('./routes/doctors'));          // GET/POST /api/doctors
app.use('/api', require('./routes/employees'));
app.use('/api', require('./routes/users'));            // GET/POST /api/users
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/currencies'));
app.use('/api', require('./routes/cashBoxes'));
app.use('/api', require('./routes/banks'));
app.use('/api', require('./routes/expenseAccounts'));
app.use('/api', require('./routes/assetAccounts'));
app.use('/api', require('./routes/chartTree'));
app.use('/api', require('./routes/partyImport'));         // إعدادات، علاجات، استيراد
app.use('/api', require('./routes/platform'));         // SUPER_ADMIN /api/platform/*

function resolveFrontendDist() {
  const candidates = [
    process.env.FRONTEND_DIST,
    path.join(__dirname, '..', '..', 'dentalcare-frontend', 'dist'),
    path.join(__dirname, '..', 'public'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

const shouldServeFrontend = process.env.SERVE_FRONTEND === '1'
  || (process.env.SERVE_FRONTEND !== '0' && process.env.NODE_ENV === 'production');
const frontendDist = shouldServeFrontend ? resolveFrontendDist() : null;

if (frontendDist) {
  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
  console.log(`Serving frontend from ${frontendDist}`);
} else if (shouldServeFrontend) {
  console.warn('SERVE_FRONTEND requested but dentalcare-frontend/dist not found — API only');
}

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'خطأ غير متوقع بالسيرفر' });
});

const PORT = process.env.PORT || 5000;
const { ensureCheckbooksSchema } = require('./db/ensureCheckbooks');

ensureCheckbooksSchema()
  .catch((err) => console.error('checkbooks ensure failed:', err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`🚀 DentalCare API running on port ${PORT}`));
  });

module.exports = app;
