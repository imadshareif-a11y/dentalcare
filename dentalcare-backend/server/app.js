// app.js
// -----------------------------------------------------------
// نقطة الدخول — بس تجميع، بلا أي منطق أعمال هون. لو لاحظت AI
// عم يقترح يضيف منطق محاسبي أو استعلام قاعدة بيانات مباشرة
// بهاد الملف، هاي إشارة إنه رجع لنفس نمط "كل شي بملف واحد".
// -----------------------------------------------------------

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', require('./routes/auth'));           // POST /api/auth/login
app.use('/api', require('./routes/accounts'));       // GET  /api/accounts
app.use('/api', require('./routes/vouchers'));      // POST /api/receipts
app.use('/api', require('./routes/payments'));      // POST /api/payments
app.use('/api', require('./routes/journal'));        // POST /api/journal-entries, /api/opening-balance
app.use('/api', require('./routes/clinical'));       // POST /api/clinical/commit-session
app.use('/api', require('./routes/patients'));       // POST+GET /api/patients
app.use('/api', require('./routes/reports'));        // GET /api/reports/*
app.use('/api', require('./routes/checks'));          // GET/POST /api/checks/*
app.use('/api', require('./routes/doctors'));          // GET/POST /api/doctors

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'خطأ غير متوقع بالسيرفر' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 DentalCare API running on port ${PORT}`));

module.exports = app;
