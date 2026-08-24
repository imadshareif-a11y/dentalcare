const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { requireAuth, requireRole, requireClinicContext } = require('../middleware/auth');
const { withTenantClient, withSystemClient } = require('../db/pool');
const { DATE_FORMATS, NUMBER_DIGITS, TIME_FORMATS, publicSettings } = require('../settings/defaults');
const { normalizeLetterheadLayout } = require('../settings/letterheadLayout');
const { normalizeProvider, publicAiSettings } = require('../settings/aiConfig');
const { ensureTenantSettingsSchema } = require('../db/ensureTenantSettings');
const { pingAiConnection, resolveTestConfig } = require('../settings/visionClient');
const { setBaseCurrency } = require('../accounting/currency');
const { normalizeWaProvider, resolveWhatsappConfig } = require('../whatsapp/config');
const { testWhatsappConnection } = require('../whatsapp/client');
const { normalizeDefaultCountry } = require('../whatsapp/phone');
const { normalizeConditionCode, inferConditionFromTreatmentName } = require('../lib/toothConditions');
const {
  ensureToothConditionsSchema,
  listToothConditions,
  createToothCondition,
  updateToothCondition,
  deleteToothCondition,
} = require('../db/ensureToothConditions');
const { ensureToothChartSchema } = require('../db/ensureToothChart');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
});

const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

const SETTINGS_SELECT = `
  SELECT date_format, currency_symbol, decimal_places, thousands_separator,
         decimal_separator, print_header_text, letterhead_mime, letterhead_layout,
         (letterhead_bytes IS NOT NULL) AS has_letterhead,
         number_digits,
         time_format,
         patients_prefix, patients_width, patients_next,
         suppliers_prefix, suppliers_width, suppliers_next,
         doctors_prefix, doctors_width, doctors_next,
         employees_prefix, employees_width, employees_next,
         receipts_prefix, receipts_width, receipts_next,
         payments_prefix, payments_width, payments_next,
         journal_docs_prefix, journal_docs_width, journal_docs_next,
         bank_entries_prefix, bank_entries_width, bank_entries_next,
         purchase_invoices_prefix, purchase_invoices_width, purchase_invoices_next,
         credit_notes_prefix, credit_notes_width, credit_notes_next,
         debit_notes_prefix, debit_notes_width, debit_notes_next,
         ai_enabled, ai_api_key, ai_base_url, ai_vision_model, ai_provider,
         wa_enabled, wa_provider, wa_api_token, wa_phone_number_id, wa_base_url,
         wa_default_country, wa_template_appointment, wa_template_reminder,
         wa_template_payment, wa_template_balance,
         wa_auto_appointment, wa_auto_reminder, wa_auto_payment
  FROM tenant_settings WHERE tenant_id = $1
`;

const SETTINGS_RETURNING = `
  date_format, currency_symbol, decimal_places, thousands_separator,
  decimal_separator, print_header_text, letterhead_mime, letterhead_layout,
  (letterhead_bytes IS NOT NULL) AS has_letterhead,
  number_digits,
  time_format,
  patients_prefix, patients_width, patients_next,
  suppliers_prefix, suppliers_width, suppliers_next,
  doctors_prefix, doctors_width, doctors_next,
  employees_prefix, employees_width, employees_next,
  receipts_prefix, receipts_width, receipts_next,
  payments_prefix, payments_width, payments_next,
  journal_docs_prefix, journal_docs_width, journal_docs_next,
  bank_entries_prefix, bank_entries_width, bank_entries_next,
  purchase_invoices_prefix, purchase_invoices_width, purchase_invoices_next,
  credit_notes_prefix, credit_notes_width, credit_notes_next,
  debit_notes_prefix, debit_notes_width, debit_notes_next,
  ai_enabled, ai_api_key, ai_base_url, ai_vision_model, ai_provider,
  wa_enabled, wa_provider, wa_api_token, wa_phone_number_id, wa_base_url,
  wa_default_country, wa_template_appointment, wa_template_reminder,
  wa_template_payment, wa_template_balance,
  wa_auto_appointment, wa_auto_reminder, wa_auto_payment
`;

const AI_RETURNING = `
  ai_enabled, ai_api_key, ai_base_url, ai_vision_model, ai_provider
`;

function mapSettings(row) {
  return publicSettings(row);
}

router.get('/settings', requireAuth, requireClinicContext, async (req, res) => {
  try {
    await ensureTenantSettingsSchema();
    const data = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [req.user.tenantId]
      );
      const result = await client.query(SETTINGS_SELECT, [req.user.tenantId]);
      const base = await client.query(
        `SELECT id, code, symbol FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
        [req.user.tenantId]
      );
      return {
        settings: result.rows[0] || null,
        baseCurrency: base.rows[0] || null,
      };
    });
    res.json({
      ...mapSettings(data.settings),
      dateFormats: DATE_FORMATS,
      baseCurrencyId: data.baseCurrency?.id || null,
      baseCurrencyCode: data.baseCurrency?.code || null,
      baseCurrencySymbol: data.baseCurrency?.symbol || null,
      currencySymbol:
        (data.settings?.currency_symbol && String(data.settings.currency_symbol).trim())
        || data.baseCurrency?.symbol
        || data.baseCurrency?.code
        || '₪',
    });
  } catch (err) {
    console.error('Loading settings failed:', err);
    res.status(500).json({
      error: 'تعذّر جلب الإعدادات',
      detail: err.message || null,
      code: err.code || null,
    });
  }
});

router.patch('/settings', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const {
    dateFormat, currencySymbol, decimalPlaces,
    thousandsSeparator, decimalSeparator, printHeaderText, letterheadLayout,
    numberDigits, timeFormat,
    patientsPrefix, patientsWidth, patientsNext,
    suppliersPrefix, suppliersWidth, suppliersNext,
    doctorsPrefix, doctorsWidth, doctorsNext,
    employeesPrefix, employeesWidth, employeesNext,
    receiptsPrefix, receiptsWidth, receiptsNext,
    paymentsPrefix, paymentsWidth, paymentsNext,
    journalDocsPrefix, journalDocsWidth, journalDocsNext,
    bankEntriesPrefix, bankEntriesWidth, bankEntriesNext,
    purchaseInvoicesPrefix, purchaseInvoicesWidth, purchaseInvoicesNext,
    creditNotesPrefix, creditNotesWidth, creditNotesNext,
    debitNotesPrefix, debitNotesWidth, debitNotesNext,
    baseCurrencyId,
  } = req.body;

  if (dateFormat && !DATE_FORMATS.includes(dateFormat)) {
    return res.status(400).json({ error: 'شكل التاريخ غير مدعوم' });
  }
  if (numberDigits && !NUMBER_DIGITS.includes(numberDigits)) {
    return res.status(400).json({ error: 'ترميز الأرقام غير مدعوم' });
  }
  if (timeFormat && !TIME_FORMATS.includes(timeFormat)) {
    return res.status(400).json({ error: 'نظام الوقت غير مدعوم' });
  }
  const places = decimalPlaces == null ? null : Number(decimalPlaces);
  if (places != null && (places < 0 || places > 4)) {
    return res.status(400).json({ error: 'عدد الخانات العشرية يجب أن يكون بين 0 و 4' });
  }

  function clampWidth(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1 || n > 8) throw Object.assign(new Error('عرض الرقم يجب أن يكون بين 1 و 8'), { statusCode: 400 });
    return n;
  }
  function clampNext(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 1) throw Object.assign(new Error('العداد يجب أن يكون 1 أو أكبر'), { statusCode: 400 });
    return n;
  }

  try {
    const wP = clampWidth(patientsWidth);
    const wS = clampWidth(suppliersWidth);
    const wD = clampWidth(doctorsWidth);
    const wE = clampWidth(employeesWidth);
    const wRc = clampWidth(receiptsWidth);
    const wPy = clampWidth(paymentsWidth);
    const wJv = clampWidth(journalDocsWidth);
    const wBe = clampWidth(bankEntriesWidth);
    const wPi = clampWidth(purchaseInvoicesWidth);
    const wCn = clampWidth(creditNotesWidth);
    const wDn = clampWidth(debitNotesWidth);
    const nP = clampNext(patientsNext);
    const nS = clampNext(suppliersNext);
    const nD = clampNext(doctorsNext);
    const nE = clampNext(employeesNext);
    const nRc = clampNext(receiptsNext);
    const nPy = clampNext(paymentsNext);
    const nJv = clampNext(journalDocsNext);
    const nBe = clampNext(bankEntriesNext);
    const nPi = clampNext(purchaseInvoicesNext);
    const nCn = clampNext(creditNotesNext);
    const nDn = clampNext(debitNotesNext);

    const row = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [req.user.tenantId]
      );

      if (baseCurrencyId) {
        await setBaseCurrency(client, req.user.tenantId, baseCurrencyId);
      }

      const result = await client.query(
        `UPDATE tenant_settings SET
           date_format = COALESCE($2, date_format),
           currency_symbol = COALESCE($3, currency_symbol),
           decimal_places = COALESCE($4, decimal_places),
           thousands_separator = COALESCE($5, thousands_separator),
           decimal_separator = COALESCE($6, decimal_separator),
           print_header_text = COALESCE($7, print_header_text),
           letterhead_layout = COALESCE($8, letterhead_layout),
           number_digits = COALESCE($9, number_digits),
           time_format = COALESCE($10, time_format),
           patients_prefix = COALESCE($11, patients_prefix),
           patients_width = COALESCE($12, patients_width),
           patients_next = COALESCE($13, patients_next),
           suppliers_prefix = COALESCE($14, suppliers_prefix),
           suppliers_width = COALESCE($15, suppliers_width),
           suppliers_next = COALESCE($16, suppliers_next),
           doctors_prefix = COALESCE($17, doctors_prefix),
           doctors_width = COALESCE($18, doctors_width),
           doctors_next = COALESCE($19, doctors_next),
           employees_prefix = COALESCE($20, employees_prefix),
           employees_width = COALESCE($21, employees_width),
           employees_next = COALESCE($22, employees_next),
           receipts_prefix = COALESCE($23, receipts_prefix),
           receipts_width = COALESCE($24, receipts_width),
           receipts_next = COALESCE($25, receipts_next),
           payments_prefix = COALESCE($26, payments_prefix),
           payments_width = COALESCE($27, payments_width),
           payments_next = COALESCE($28, payments_next),
           journal_docs_prefix = COALESCE($29, journal_docs_prefix),
           journal_docs_width = COALESCE($30, journal_docs_width),
           journal_docs_next = COALESCE($31, journal_docs_next),
           bank_entries_prefix = COALESCE($32, bank_entries_prefix),
           bank_entries_width = COALESCE($33, bank_entries_width),
           bank_entries_next = COALESCE($34, bank_entries_next),
           purchase_invoices_prefix = COALESCE($35, purchase_invoices_prefix),
           purchase_invoices_width = COALESCE($36, purchase_invoices_width),
           purchase_invoices_next = COALESCE($37, purchase_invoices_next),
           credit_notes_prefix = COALESCE($38, credit_notes_prefix),
           credit_notes_width = COALESCE($39, credit_notes_width),
           credit_notes_next = COALESCE($40, credit_notes_next),
           debit_notes_prefix = COALESCE($41, debit_notes_prefix),
           debit_notes_width = COALESCE($42, debit_notes_width),
           debit_notes_next = COALESCE($43, debit_notes_next),
           updated_at = now()
         WHERE tenant_id = $1
         RETURNING ${SETTINGS_RETURNING}`,
        [
          req.user.tenantId,
          dateFormat || null,
          currencySymbol == null ? null : String(currencySymbol).slice(0, 8),
          places,
          thousandsSeparator == null ? null : String(thousandsSeparator).slice(0, 2),
          decimalSeparator == null ? null : String(decimalSeparator).slice(0, 2),
          printHeaderText == null ? null : String(printHeaderText),
          letterheadLayout == null ? null : normalizeLetterheadLayout(letterheadLayout),
          numberDigits || null,
          timeFormat || null,
          patientsPrefix == null ? null : String(patientsPrefix).slice(0, 10),
          wP, nP,
          suppliersPrefix == null ? null : String(suppliersPrefix).slice(0, 10),
          wS, nS,
          doctorsPrefix == null ? null : String(doctorsPrefix).slice(0, 10),
          wD, nD,
          employeesPrefix == null ? null : String(employeesPrefix).slice(0, 10),
          wE, nE,
          receiptsPrefix == null ? null : String(receiptsPrefix).slice(0, 10),
          wRc, nRc,
          paymentsPrefix == null ? null : String(paymentsPrefix).slice(0, 10),
          wPy, nPy,
          journalDocsPrefix == null ? null : String(journalDocsPrefix).slice(0, 10),
          wJv, nJv,
          bankEntriesPrefix == null ? null : String(bankEntriesPrefix).slice(0, 10),
          wBe, nBe,
          purchaseInvoicesPrefix == null ? null : String(purchaseInvoicesPrefix).slice(0, 10),
          wPi, nPi,
          creditNotesPrefix == null ? null : String(creditNotesPrefix).slice(0, 10),
          wCn, nCn,
          debitNotesPrefix == null ? null : String(debitNotesPrefix).slice(0, 10),
          wDn, nDn,
        ]
      );
      return result.rows[0];
    });
    const base = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, code, symbol FROM currencies WHERE tenant_id = $1 AND is_base = TRUE LIMIT 1`,
        [req.user.tenantId]
      );
      return result.rows[0] || null;
    });
    res.json({
      ...mapSettings(row),
      baseCurrencyId: base?.id || null,
          baseCurrencyCode: base?.code || null,
          baseCurrencySymbol: base?.symbol || null,
          currencySymbol:
            (row?.currency_symbol && String(row.currency_symbol).trim())
            || base?.symbol
            || base?.code
            || '₪',
        });
  } catch (err) {
    if (err.statusCode === 400 || err.statusCode === 404) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Updating settings failed:', err);
    res.status(500).json({ error: 'تعذّر حفظ الإعدادات' });
  }
});

router.patch('/settings/ai', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const {
    aiEnabled,
    aiProvider,
    aiApiKey,
    clearAiApiKey,
    aiBaseUrl,
    aiVisionModel,
  } = req.body;

  try {
    await ensureTenantSettingsSchema();
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [req.user.tenantId]
      );

      const current = await client.query(
        `SELECT ai_api_key FROM tenant_settings WHERE tenant_id = $1`,
        [req.user.tenantId]
      );
      let nextKey = current.rows[0]?.ai_api_key || null;
      if (clearAiApiKey) {
        nextKey = null;
      } else if (typeof aiApiKey === 'string' && aiApiKey.trim()) {
        nextKey = aiApiKey.trim().slice(0, 500);
      }

      const provider = normalizeProvider(aiProvider);

      const result = await client.query(
        `UPDATE tenant_settings SET
           ai_enabled = COALESCE($2, ai_enabled),
           ai_provider = $3,
           ai_api_key = $4,
           ai_base_url = $5,
           ai_vision_model = COALESCE(NULLIF($6, ''), ai_vision_model),
           updated_at = now()
         WHERE tenant_id = $1
         RETURNING ${AI_RETURNING}`,
        [
          req.user.tenantId,
          typeof aiEnabled === 'boolean' ? aiEnabled : null,
          provider,
          nextKey,
          aiBaseUrl == null ? null : (String(aiBaseUrl).trim().slice(0, 255) || null),
          aiVisionModel == null ? null : String(aiVisionModel).trim().slice(0, 120),
        ]
      );
      if (!result.rows[0]) {
        throw Object.assign(new Error('تعذّر حفظ إعدادات العيادة'), { statusCode: 404 });
      }
      return result.rows[0];
    });

    res.json(publicAiSettings(row));
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: err.message });
    }
    console.error('Updating AI settings failed:', err);
    if (err.code === '42703') {
      return res.status(503).json({ error: 'قاعدة البيانات تحتاج تحديث — أعد نشر السيرفر أو شغّل migrate:all' });
    }
    res.status(500).json({ error: 'تعذّر حفظ إعدادات الذكاء الاصطناعي' });
  }
});

router.post('/settings/ai/test', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const {
    aiProvider,
    aiApiKey,
    aiBaseUrl,
    aiVisionModel,
  } = req.body || {};

  try {
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT ai_enabled, ai_api_key, ai_base_url, ai_vision_model, ai_provider
         FROM tenant_settings WHERE tenant_id = $1`,
        [req.user.tenantId]
      );
      return result.rows[0] || null;
    });

    const config = resolveTestConfig(row, {
      aiProvider,
      aiApiKey,
      aiBaseUrl,
      aiVisionModel,
    });
    const result = await pingAiConnection(config);
    res.json({
      success: true,
      provider: result.provider,
      model: result.model,
      aiReady: config.available,
      message: 'اتصال المزوّد ناجح',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('AI connection test failed:', err);
    res.status(500).json({ error: 'تعذّر اختبار اتصال المزوّد' });
  }
});

router.patch('/settings/whatsapp', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const {
    waEnabled,
    waProvider,
    waApiToken,
    clearWaApiToken,
    waPhoneNumberId,
    waBaseUrl,
    waDefaultCountry,
    waTemplateAppointment,
    waTemplateReminder,
    waTemplatePayment,
    waTemplateBalance,
    waAutoAppointment,
    waAutoReminder,
    waAutoPayment,
  } = req.body || {};

  try {
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
        [req.user.tenantId]
      );

      const current = await client.query(
        `SELECT wa_api_token FROM tenant_settings WHERE tenant_id = $1`,
        [req.user.tenantId]
      );
      let nextToken = current.rows[0]?.wa_api_token || null;
      if (clearWaApiToken) {
        nextToken = null;
      } else if (typeof waApiToken === 'string' && waApiToken.trim()) {
        nextToken = waApiToken.trim().slice(0, 500);
      }

      const provider = normalizeWaProvider(waProvider);
      const result = await client.query(
        `UPDATE tenant_settings SET
           wa_enabled = COALESCE($2, wa_enabled),
           wa_provider = $3,
           wa_api_token = $4,
           wa_phone_number_id = $5,
           wa_base_url = $6,
           wa_default_country = COALESCE(NULLIF($7, ''), wa_default_country),
           wa_template_appointment = $8,
           wa_template_reminder = $9,
           wa_template_payment = $10,
           wa_template_balance = $11,
           wa_auto_appointment = COALESCE($12, wa_auto_appointment),
           wa_auto_reminder = COALESCE($13, wa_auto_reminder),
           wa_auto_payment = COALESCE($14, wa_auto_payment),
           updated_at = now()
         WHERE tenant_id = $1
         RETURNING ${SETTINGS_RETURNING}`,
        [
          req.user.tenantId,
          typeof waEnabled === 'boolean' ? waEnabled : null,
          provider,
          nextToken,
          waPhoneNumberId == null ? null : (String(waPhoneNumberId).trim().slice(0, 120) || null),
          waBaseUrl == null ? null : (String(waBaseUrl).trim().slice(0, 255) || null),
          waDefaultCountry == null ? null : normalizeDefaultCountry(waDefaultCountry),
          waTemplateAppointment == null ? null : (String(waTemplateAppointment).trim().slice(0, 120) || null),
          waTemplateReminder == null ? null : (String(waTemplateReminder).trim().slice(0, 120) || null),
          waTemplatePayment == null ? null : (String(waTemplatePayment).trim().slice(0, 120) || null),
          waTemplateBalance == null ? null : (String(waTemplateBalance).trim().slice(0, 120) || null),
          typeof waAutoAppointment === 'boolean' ? waAutoAppointment : null,
          typeof waAutoReminder === 'boolean' ? waAutoReminder : null,
          typeof waAutoPayment === 'boolean' ? waAutoPayment : null,
        ]
      );
      return result.rows[0];
    });

    res.json(mapSettings(row));
  } catch (err) {
    console.error('Updating WhatsApp settings failed:', err);
    res.status(500).json({ error: 'تعذّر حفظ إعدادات واتساب' });
  }
});

router.post('/settings/whatsapp/test', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const {
    waProvider,
    waApiToken,
    waPhoneNumberId,
    waBaseUrl,
    waDefaultCountry,
  } = req.body || {};

  try {
    const row = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT wa_enabled, wa_provider, wa_api_token, wa_phone_number_id, wa_base_url, wa_default_country
         FROM tenant_settings WHERE tenant_id = $1`,
        [req.user.tenantId]
      );
      return result.rows[0] || null;
    });

    const merged = {
      wa_enabled: true,
      wa_provider: waProvider || row?.wa_provider,
      wa_api_token: (typeof waApiToken === 'string' && waApiToken.trim())
        ? waApiToken.trim()
        : row?.wa_api_token,
      wa_phone_number_id: waPhoneNumberId != null ? waPhoneNumberId : row?.wa_phone_number_id,
      wa_base_url: waBaseUrl != null ? waBaseUrl : row?.wa_base_url,
      wa_default_country: waDefaultCountry || row?.wa_default_country,
    };
    const config = resolveWhatsappConfig(merged);
    const result = await testWhatsappConnection(config);
    res.json({
      success: true,
      provider: result.provider,
      displayPhone: result.displayPhone || null,
      message: 'اتصال واتساب ناجح',
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('WhatsApp connection test failed:', err);
    res.status(500).json({ error: 'تعذّر اختبار اتصال واتساب' });
  }
});

router.get('/settings/letterhead', requireAuth, requireClinicContext, async (req, res) => {
  try {
    const file = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT letterhead_mime, letterhead_bytes FROM tenant_settings WHERE tenant_id = $1`,
        [req.user.tenantId]
      );
      return result.rows[0] || null;
    });
    if (!file?.letterhead_bytes) return res.status(404).json({ error: 'لا توجد ترويسة مرفوعة' });
    res.setHeader('Content-Type', file.letterhead_mime || 'application/octet-stream');
    res.send(file.letterhead_bytes);
  } catch (err) {
    console.error('Fetching letterhead failed:', err);
    res.status(500).json({ error: 'تعذّر جلب الترويسة' });
  }
});

router.post(
  '/settings/letterhead',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'يجب اختيار ملف صورة أو PDF' });
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!allowed.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'الملف يجب أن يكون صورة (PNG/JPG) أو PDF' });
    }
    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        await client.query(
          `INSERT INTO tenant_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`,
          [req.user.tenantId]
        );
        await client.query(
          `UPDATE tenant_settings
           SET letterhead_mime = $2, letterhead_bytes = $3, updated_at = now()
           WHERE tenant_id = $1`,
          [req.user.tenantId, req.file.mimetype, req.file.buffer]
        );
      });
      res.json({ success: true, mime: req.file.mimetype });
    } catch (err) {
      console.error('Uploading letterhead failed:', err);
      res.status(500).json({ error: 'تعذّر رفع الترويسة' });
    }
  }
);

router.delete('/settings/letterhead', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(
        `UPDATE tenant_settings SET letterhead_mime = NULL, letterhead_bytes = NULL, updated_at = now()
         WHERE tenant_id = $1`,
        [req.user.tenantId]
      );
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Deleting letterhead failed:', err);
    res.status(500).json({ error: 'تعذّر حذف الترويسة' });
  }
});

router.patch('/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 خانات على الأقل' });
  }
  try {
    const user = await withSystemClient(async (client) => {
      const result = await client.query(
        `SELECT id, password_hash FROM users WHERE id = $1 AND is_active = TRUE`,
        [req.user.userId]
      );
      return result.rows[0] || null;
    });
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    const hash = await bcrypt.hash(newPassword, 10);
    await withSystemClient(async (client) => {
      await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, req.user.userId]);
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Password change failed:', err);
    res.status(500).json({ error: 'تعذّر تغيير كلمة المرور' });
  }
});

router.get('/tooth-conditions', requireAuth, requireClinicContext, async (req, res) => {
  try {
    await ensureToothConditionsSchema();
    const activeOnly = String(req.query.activeOnly || '') === '1';
    const rows = await withTenantClient(req.user.tenantId, async (client) => (
      listToothConditions(client, req.user.tenantId, { activeOnly })
    ));
    res.json(rows);
  } catch (err) {
    console.error('Listing tooth conditions failed:', err);
    res.status(500).json({ error: 'تعذّر جلب حالات السن' });
  }
});

router.post('/tooth-conditions', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    await ensureToothConditionsSchema();
    const created = await withTenantClient(req.user.tenantId, async (client) => (
      createToothCondition(client, req.user.tenantId, req.body || {})
    ));
    res.status(201).json(created);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Creating tooth condition failed:', err);
    res.status(500).json({ error: 'تعذّر إضافة حالة السن' });
  }
});

router.patch('/tooth-conditions/:id', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    await ensureToothConditionsSchema();
    const updated = await withTenantClient(req.user.tenantId, async (client) => (
      updateToothCondition(client, req.user.tenantId, req.params.id, req.body || {})
    ));
    res.json(updated);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Updating tooth condition failed:', err);
    res.status(500).json({ error: 'تعذّر حفظ حالة السن' });
  }
});

router.delete('/tooth-conditions/:id', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    await ensureToothConditionsSchema();
    await withTenantClient(req.user.tenantId, async (client) => (
      deleteToothCondition(client, req.user.tenantId, req.params.id)
    ));
    res.json({ success: true });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Deleting tooth condition failed:', err);
    res.status(500).json({ error: 'تعذّر حذف حالة السن' });
  }
});

async function loadCatalogStagesMap(client, tenantId) {
  await ensureToothChartSchema();
  const result = await client.query(
    `SELECT id, catalog_id, name, cost, sort_order, is_optional
     FROM treatment_catalog_stages
     WHERE tenant_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [tenantId]
  );
  const map = new Map();
  for (const row of result.rows) {
    const key = String(row.catalog_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      isOptional: Boolean(row.is_optional),
    });
  }
  return map;
}

async function replaceCatalogStages(client, tenantId, catalogId, stagesInput) {
  await ensureToothChartSchema();
  const stages = Array.isArray(stagesInput) ? stagesInput : [];
  await client.query(
    `DELETE FROM treatment_catalog_stages WHERE catalog_id = $1 AND tenant_id = $2`,
    [catalogId, tenantId]
  );
  let order = 0;
  for (const st of stages) {
    const name = String(st.name || '').trim();
    if (!name) continue;
    const isOptional = Boolean(st.isOptional ?? st.is_optional);
    await client.query(
      `INSERT INTO treatment_catalog_stages
         (tenant_id, catalog_id, name, cost, sort_order, is_optional)
       VALUES ($1, $2, $3, 0, $4, $5)`,
      [tenantId, catalogId, name, order, isOptional]
    );
    order += 1;
  }
}

router.get('/treatments', requireAuth, requireClinicContext, async (req, res) => {
  try {
    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(`ALTER TABLE treatment_catalog ADD COLUMN IF NOT EXISTS condition_code VARCHAR(32)`);
      const result = await client.query(
        `SELECT id, name, price, is_active, sort_order, condition_code
         FROM treatment_catalog
         WHERE tenant_id = $1
         ORDER BY sort_order ASC, name ASC`,
        [req.user.tenantId]
      );
      const stagesMap = await loadCatalogStagesMap(client, req.user.tenantId);
      return result.rows.map((r) => ({
        ...r,
        stages: stagesMap.get(String(r.id)) || [],
        hasStages: (stagesMap.get(String(r.id)) || []).length > 0,
      }));
    });
    res.json(rows.map((r) => ({
      ...r,
      price: Number(r.price),
      condition_code: r.condition_code || null,
    })));
  } catch (err) {
    console.error('Listing treatments failed:', err);
    res.status(500).json({ error: 'تعذّر جلب العلاجات' });
  }
});

router.post('/treatments', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const { name, price, sortOrder, conditionCode, stages } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'اسم العلاج مطلوب' });
  const p = Number(price);
  if (!(p >= 0)) return res.status(400).json({ error: 'السعر غير صالح' });
  const code = normalizeConditionCode(conditionCode)
    || inferConditionFromTreatmentName(name)
    || null;
  try {
    const created = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(`ALTER TABLE treatment_catalog ADD COLUMN IF NOT EXISTS condition_code VARCHAR(32)`);
      const result = await client.query(
        `INSERT INTO treatment_catalog (tenant_id, name, price, sort_order, condition_code)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, price, is_active, sort_order, condition_code`,
        [req.user.tenantId, String(name).trim(), p, Number(sortOrder) || 0, code]
      );
      const row = result.rows[0];
      if (Array.isArray(stages) && stages.length > 0) {
        await replaceCatalogStages(client, req.user.tenantId, row.id, stages);
      }
      const stagesMap = await loadCatalogStagesMap(client, req.user.tenantId);
      return { ...row, stages: stagesMap.get(String(row.id)) || [] };
    });
    res.status(201).json({
      ...created,
      price: Number(created.price),
      condition_code: created.condition_code || null,
      stages: created.stages || [],
      hasStages: (created.stages || []).length > 0,
    });
  } catch (err) {
    console.error('Creating treatment failed:', err);
    res.status(500).json({ error: 'تعذّر إضافة العلاج' });
  }
});

router.patch('/treatments/:id', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const { name, price, isActive, sortOrder, conditionCode, stages } = req.body;
  const hasStages = Object.prototype.hasOwnProperty.call(req.body, 'stages');
  const hasCondition = Object.prototype.hasOwnProperty.call(req.body, 'conditionCode');
  const nextCode = hasCondition
    ? (conditionCode ? normalizeConditionCode(conditionCode) : null)
    : undefined;
  try {
    const updated = await withTenantClient(req.user.tenantId, async (client) => {
      await client.query(`ALTER TABLE treatment_catalog ADD COLUMN IF NOT EXISTS condition_code VARCHAR(32)`);
      const result = await client.query(
        `UPDATE treatment_catalog SET
           name = COALESCE($3, name),
           price = COALESCE($4, price),
           is_active = COALESCE($5, is_active),
           sort_order = COALESCE($6, sort_order),
           condition_code = CASE WHEN $7::boolean THEN $8 ELSE condition_code END
         WHERE id = $1 AND tenant_id = $2
         RETURNING id, name, price, is_active, sort_order, condition_code`,
        [
          req.params.id,
          req.user.tenantId,
          name ? String(name).trim() : null,
          price == null ? null : Number(price),
          typeof isActive === 'boolean' ? isActive : null,
          sortOrder == null ? null : Number(sortOrder),
          hasCondition,
          nextCode,
        ]
      );
      const row = result.rows[0] || null;
      if (row && hasStages) {
        await replaceCatalogStages(client, req.user.tenantId, row.id, stages);
      }
      if (!row) return null;
      const stagesMap = await loadCatalogStagesMap(client, req.user.tenantId);
      return { ...row, stages: stagesMap.get(String(row.id)) || [] };
    });
    if (!updated) return res.status(404).json({ error: 'العلاج غير موجود' });
    res.json({
      ...updated,
      price: Number(updated.price),
      condition_code: updated.condition_code || null,
      stages: updated.stages || [],
      hasStages: (updated.stages || []).length > 0,
    });
  } catch (err) {
    console.error('Updating treatment failed:', err);
    res.status(500).json({ error: 'تعذّر تعديل العلاج' });
  }
});

router.delete('/treatments/:id', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    const deleted = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `DELETE FROM treatment_catalog WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, req.user.tenantId]
      );
      return result.rows[0] || null;
    });
    if (!deleted) return res.status(404).json({ error: 'العلاج غير موجود' });
    res.json({ success: true });
  } catch (err) {
    console.error('Deleting treatment failed:', err);
    res.status(500).json({ error: 'تعذّر حذف العلاج' });
  }
});

router.get('/rooms', requireAuth, requireClinicContext, async (req, res) => {
  try {
    const rows = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, name, name_en, name_he, is_active, sort_order
         FROM rooms
         WHERE tenant_id = $1
         ORDER BY sort_order ASC, name ASC`,
        [req.user.tenantId]
      );
      return result.rows;
    });
    res.json(rows);
  } catch (err) {
    console.error('Listing rooms failed:', err);
    res.status(500).json({ error: 'تعذّر جلب الغرف' });
  }
});

router.post('/rooms', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const { sortOrder } = req.body;
  if (!req.body.name || !String(req.body.name).trim()) {
    return res.status(400).json({ error: 'اسم الغرفة مطلوب' });
  }
  try {
    const created = await withTenantClient(req.user.tenantId, async (client) => {
      const { namesFromBody } = require('../i18n/localizeNames');
      const names = await namesFromBody(client, req.user.tenantId, req.body);
      const result = await client.query(
        `INSERT INTO rooms (tenant_id, name, name_en, name_he, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, name_en, name_he, is_active, sort_order`,
        [
          req.user.tenantId,
          names.name,
          names.name_en,
          names.name_he,
          Number(sortOrder) || 0,
        ]
      );
      return result.rows[0];
    });
    res.status(201).json(created);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'يوجد غرفة بنفس الاسم' });
    }
    console.error('Creating room failed:', err);
    res.status(500).json({ error: 'تعذّر إضافة الغرفة' });
  }
});

router.patch('/rooms/:id', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  const { isActive, sortOrder } = req.body;
  try {
    const updated = await withTenantClient(req.user.tenantId, async (client) => {
      const { namesFromBody } = require('../i18n/localizeNames');
      const names = await namesFromBody(client, req.user.tenantId, req.body, { partial: true });

      const fields = [];
      const values = [req.params.id, req.user.tenantId];
      const push = (col, val) => {
        values.push(val);
        fields.push(`${col} = $${values.length}`);
      };

      if (names) {
        push('name', names.name);
        push('name_en', names.name_en);
        push('name_he', names.name_he);
      }
      if (typeof isActive === 'boolean') push('is_active', isActive);
      if (sortOrder != null) push('sort_order', Number(sortOrder));

      if (fields.length === 0) {
        throw Object.assign(new Error('لا توجد حقول للتحديث'), { statusCode: 400 });
      }

      const result = await client.query(
        `UPDATE rooms SET ${fields.join(', ')}
         WHERE id = $1 AND tenant_id = $2
         RETURNING id, name, name_en, name_he, is_active, sort_order`,
        values
      );
      return result.rows[0] || null;
    });
    if (!updated) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    res.json(updated);
  } catch (err) {
    if (err.statusCode === 400) return res.status(400).json({ error: err.message });
    if (err.code === '23505') {
      return res.status(409).json({ error: 'يوجد غرفة بنفس الاسم' });
    }
    console.error('Updating room failed:', err);
    res.status(500).json({ error: 'تعذّر تعديل الغرفة' });
  }
});

router.delete('/rooms/:id', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    const deleted = await withTenantClient(req.user.tenantId, async (client) => {
      const inUse = await client.query(
        `SELECT 1 FROM appointments WHERE room_id = $1 AND tenant_id = $2 LIMIT 1`,
        [req.params.id, req.user.tenantId]
      );
      if (inUse.rowCount > 0) {
        throw Object.assign(new Error('لا يمكن حذف غرفة مرتبطة بمواعيد'), { statusCode: 409 });
      }
      const result = await client.query(
        `DELETE FROM rooms WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params.id, req.user.tenantId]
      );
      return result.rows[0] || null;
    });
    if (!deleted) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    res.json({ success: true });
  } catch (err) {
    if (err.statusCode === 409) return res.status(409).json({ error: err.message });
    console.error('Deleting room failed:', err);
    res.status(500).json({ error: 'تعذّر حذف الغرفة' });
  }
});

// ——— نسخ احتياطي للعيادة ———
router.get('/settings/backup/export', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    const { buildTenantZipBuffer } = require('../backup/tenantExport');
    const buffer = await buildTenantZipBuffer(req.user.tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="clinic-backup-${stamp}.zip"`);
    res.send(buffer);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Tenant backup export failed:', err);
    res.status(500).json({ error: 'تعذّر تصدير نسخة العيادة' });
  }
});

router.post(
  '/settings/backup/restore',
  requireAuth,
  requireClinicContext,
  requireRole(['OWNER']),
  backupUpload.single('file'),
  async (req, res) => {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'يجب رفع ملف ZIP للنسخة' });
    }
    const confirm = String(req.body?.confirm || '');
    if (confirm !== 'استعادة' && confirm !== 'RESTORE') {
      return res.status(400).json({ error: 'للتأكيد اكتب استعادة في حقل التأكيد' });
    }
    try {
      const { restoreTenantFromZipBuffer } = require('../backup/tenantImport');
      const result = await restoreTenantFromZipBuffer(req.user.tenantId, req.file.buffer);
      res.json(result);
    } catch (err) {
      if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
      console.error('Tenant backup restore failed:', err);
      res.status(500).json({ error: err.message || 'تعذّر استعادة النسخة' });
    }
  }
);

// ——— سنوات مالية ———
router.get('/settings/fiscal-years', requireAuth, requireClinicContext, async (req, res) => {
  try {
    const { listFiscalYears } = require('../accounting/fiscalYears');
    const years = await listFiscalYears(req.user.tenantId);
    res.json({ years });
  } catch (err) {
    console.error('Listing fiscal years failed:', err);
    res.status(500).json({ error: 'تعذّر جلب السنوات المالية' });
  }
});

router.post('/settings/fiscal-years/:year/close', requireAuth, requireClinicContext, requireRole(['OWNER']), async (req, res) => {
  try {
    const { closeFiscalYear } = require('../accounting/fiscalYears');
    const result = await closeFiscalYear(req.user.tenantId, req.params.year, req.user.userId);
    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    console.error('Closing fiscal year failed:', err);
    res.status(500).json({ error: 'تعذّر إقفال السنة المالية' });
  }
});

module.exports = router;
