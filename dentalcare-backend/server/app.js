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
  res.json({
    ok: true,
    service: 'dentalcare',
    // Railway يمرّر SHA تلقائيًا — يفيد للتأكد إن النشر وصل
    commit: process.env.RAILWAY_GIT_COMMIT_SHA
      || process.env.RAILWAY_DEPLOYMENT_ID
      || null,
    replaceFull: true,
    builtAt: process.env.RAILWAY_DEPLOYMENT_CREATED || null,
  });
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
app.use('/api', require('./routes/adminDashboard'));
app.use('/api', require('./routes/doctorDashboard'));
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
const { ensureRoomsSchema } = require('./db/ensureRooms');
const { ensureTenantSettingsSchema } = require('./db/ensureTenantSettings');
const { ensureTenantIsolation } = require('./db/ensureTenantIsolation');
const { ensureAppointmentsSchema } = require('./db/ensureAppointments');
const { ensureToothChartSchema } = require('./db/ensureToothChart');
const { ensureUsersAvatarSchema } = require('./db/ensureUsersAvatar');
const { ensureToothConditionsSchema } = require('./db/ensureToothConditions');
const { ensureJournalEntryNumberSchema } = require('./db/ensureJournalEntryNumber');
const { ensureJournalLineCurrencySchema } = require('./db/ensureJournalLineCurrency');
const { ensureChartAccountCurrencySchema } = require('./db/ensureChartAccountCurrency');

Promise.all([
  ensureCheckbooksSchema().catch((err) => console.error('checkbooks ensure failed:', err.message)),
  ensureRoomsSchema().catch((err) => console.error('rooms ensure failed:', err.message)),
  ensureTenantSettingsSchema()
    .catch((err) => console.error('tenant_settings ensure failed:', err.message))
    .then(() => ensureTenantIsolation())
    .catch((err) => console.error('tenant isolation ensure failed:', err.message)),
  ensureJournalEntryNumberSchema().catch((err) => console.error('journal entry_number ensure failed:', err.message)),
  ensureJournalLineCurrencySchema().catch((err) => console.error('journal line currency ensure failed:', err.message)),
  ensureChartAccountCurrencySchema().catch((err) => console.error('chart account currency ensure failed:', err.message)),
  ensureUsersAvatarSchema().catch((err) => console.error('users avatar ensure failed:', err.message)),
  ensureToothConditionsSchema().catch((err) => console.error('tooth_conditions ensure failed:', err.message)),
  ensureToothChartSchema()
    .catch((err) => console.error('tooth_chart ensure failed:', err.message))
    .then(() => ensureAppointmentsSchema())
    .catch((err) => console.error('appointments ensure failed:', err.message)),
]).catch((err) => console.error('schema ensure batch failed:', err.message));

const server = app.listen(PORT, () => {
  console.log(`🚀 DentalCare API running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — stop the other backend process first.`);
    process.exit(1);
  }
  console.error('Server failed to start:', err);
  process.exit(1);
});

module.exports = app;
