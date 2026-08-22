// routes/clinical.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { postJournalEntry, UnbalancedEntryError } = require('../accounting/engine');
const { resolveAiConfig } = require('../settings/aiConfig');
const { callVisionApi } = require('../settings/visionClient');
const { ensureToothChartSchema } = require('../db/ensureToothChart');
const {
  assertPatient,
  loadToothChart,
  setToothCurrent,
  loadTreatmentPlan,
  saveTreatmentPlan,
  applySessionTreatmentsToChart,
  loadPlanReport,
} = require('../clinical/toothChartService');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function mapImageMeta(row) {
  return {
    id: row.id,
    kind: row.kind || 'XRAY',
    label: row.label || null,
    mime: row.mime,
    sortOrder: Number(row.sort_order) || 0,
    hasAiReport: Boolean(row.ai_report),
    aiReport: row.ai_report || null,
    aiAnalyzedAt: row.ai_analyzed_at || null,
    aiModel: row.ai_model || null,
    createdAt: row.created_at || null,
  };
}

async function loadTenantAiRow(tenantId) {
  return withTenantClient(tenantId, async (client) => {
    const result = await client.query(
      `SELECT ai_enabled, ai_api_key, ai_base_url, ai_vision_model, ai_provider
       FROM tenant_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    return result.rows[0] || null;
  });
}

router.get(
  '/clinical/tooth-chart/:patientId',
  requireAuth,
  requirePermission('clinical', 'view'),
  async (req, res) => {
    try {
      await ensureToothChartSchema();
      const data = await withTenantClient(req.user.tenantId, async (client) => {
        await assertPatient(client, req.params.patientId);
        return loadToothChart(client, req.user.tenantId, req.params.patientId);
      });
      res.json(data);
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Loading tooth chart failed:', err);
      res.status(500).json({ error: 'تعذّر جلب مخطط الأسنان' });
    }
  }
);

router.put(
  '/clinical/tooth-chart/:patientId/:tooth',
  requireAuth,
  requirePermission('clinical', 'edit'),
  async (req, res) => {
    try {
      await ensureToothChartSchema();
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        await assertPatient(client, req.params.patientId);
        await setToothCurrent(
          client,
          req.user.tenantId,
          req.params.patientId,
          req.params.tooth,
          req.body.conditionCode,
          req.body.notes
        );
        return loadToothChart(client, req.user.tenantId, req.params.patientId);
      });
      res.json(result);
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Updating tooth chart failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث حالة السن' });
    }
  }
);

router.get(
  '/clinical/treatment-plan/:patientId',
  requireAuth,
  requirePermission('clinical', 'view'),
  async (req, res) => {
    try {
      await ensureToothChartSchema();
      const data = await withTenantClient(req.user.tenantId, async (client) => {
        await assertPatient(client, req.params.patientId);
        return loadTreatmentPlan(client, req.user.tenantId, req.params.patientId);
      });
      res.json(data);
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Loading treatment plan failed:', err);
      res.status(500).json({ error: 'تعذّر جلب خطة العلاج' });
    }
  }
);

router.put(
  '/clinical/treatment-plan/:patientId',
  requireAuth,
  requirePermission('clinical', 'edit'),
  async (req, res) => {
    try {
      await ensureToothChartSchema();
      const data = await withTenantClient(req.user.tenantId, async (client) => {
        await assertPatient(client, req.params.patientId);
        return saveTreatmentPlan(client, req.user.tenantId, req.params.patientId, req.body);
      });
      res.json(data);
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Saving treatment plan failed:', err);
      res.status(500).json({ error: 'تعذّر حفظ خطة العلاج' });
    }
  }
);

router.get(
  '/clinical/plan-report/:patientId',
  requireAuth,
  requirePermission('clinical', 'view'),
  async (req, res) => {
    try {
      await ensureToothChartSchema();
      const data = await withTenantClient(req.user.tenantId, async (client) => {
        await assertPatient(client, req.params.patientId);
        return loadPlanReport(client, req.user.tenantId, req.params.patientId);
      });
      res.json(data);
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Loading plan report failed:', err);
      res.status(500).json({ error: 'تعذّر جلب تقرير الخطة' });
    }
  }
);

router.post(
  '/clinical/commit-session',
  requireAuth,
  requirePermission('clinical', 'edit'),
  async (req, res) => {
    const { patientId, revenueAccountId, treatments, doctorId, notes, idempotencyKey } = req.body;
    const sessionNotes = typeof notes === 'string' ? notes.trim() : '';

    if (!patientId || !revenueAccountId || !Array.isArray(treatments) || treatments.length === 0) {
      return res.status(400).json({ error: 'بيانات الجلسة غير مكتملة' });
    }

    try {
      const patientAccountId = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT account_id FROM parties WHERE id = $1 AND party_type = 'PATIENT'`,
          [patientId]
        );
        if (result.rows.length === 0 || !result.rows[0].account_id) {
          throw new Error('لا يوجد حساب ذمة مرتبط بهذا المريض');
        }
        return result.rows[0].account_id;
      });

      const sessionTotal = treatments.reduce((sum, t) => sum + Number(t.cost || 0), 0);
      if (sessionTotal <= 0) {
        return res.status(400).json({ error: 'إجمالي الجلسة يجب أن يكون أكبر من صفر' });
      }

      let doctorLines = [];
      let doctorNameForMemo = '';
      if (doctorId) {
        const doctorInfo = await withTenantClient(req.user.tenantId, async (client) => {
          const result = await client.query(
            `SELECT p.name, p.account_id, d.compensation_type, d.percentage_rate
             FROM doctors d JOIN parties p ON p.id = d.party_id
             WHERE d.party_id = $1`,
            [doctorId]
          );
          return result.rows[0] || null;
        });

        if (doctorInfo) {
          doctorNameForMemo = doctorInfo.name;
          if (doctorInfo.compensation_type === 'PERCENTAGE' && doctorInfo.percentage_rate) {
            const commissionExpenseAccountId = await withTenantClient(req.user.tenantId, async (client) => {
              const result = await client.query(
                `SELECT id FROM chart_of_accounts WHERE tenant_id = $1 AND account_code = '5100'`,
                [req.user.tenantId]
              );
              return result.rows[0]?.id || null;
            });

            if (commissionExpenseAccountId) {
              const commission = Math.round(sessionTotal * (doctorInfo.percentage_rate / 100) * 100) / 100;
              if (commission > 0) {
                doctorLines = [
                  { accountId: commissionExpenseAccountId, debit: commission, lineMemo: `عمولة د. ${doctorInfo.name}` },
                  { accountId: doctorInfo.account_id, credit: commission, lineMemo: `عمولة جلسة — ${treatments.length} إجراء` },
                ];
              }
            }
          }
        }
      }

      const posted = await postJournalEntry({
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        sourceType: 'CLINICAL_SESSION',
        sourceRefId: patientId,
        memo: `جلسة عالجية — ${treatments.length} إجراء${doctorNameForMemo ? ` — د. ${doctorNameForMemo}` : ''}`,
        idempotencyKey,
        lines: [
          { accountId: patientAccountId, debit: sessionTotal, lineMemo: 'ترحيل تكلفة الجلسة لذمة المريض' },
          ...treatments.map((t) => ({
            accountId: revenueAccountId,
            credit: Number(t.cost),
            lineMemo: `السن #${t.tooth} - ${t.name}`,
          })),
          ...doctorLines,
        ],
      });

      let sessionId = null;
      if (!posted.deduplicated) {
        sessionId = await withTenantClient(req.user.tenantId, async (client) => {
          const session = await client.query(
            `INSERT INTO clinical_sessions (tenant_id, patient_id, doctor_id, journal_entry_id, total, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              req.user.tenantId,
              patientId,
              doctorId || null,
              posted.journalEntryId,
              sessionTotal,
              sessionNotes || null,
            ]
          );
          const newId = session.rows[0].id;
          for (const item of treatments) {
            await client.query(
              `INSERT INTO clinical_session_items (session_id, tenant_id, tooth, name, cost)
               VALUES ($1, $2, $3, $4, $5)`,
              [newId, req.user.tenantId, item.tooth || null, item.name, Number(item.cost)]
            );
          }
          await ensureToothChartSchema();
          await applySessionTreatmentsToChart(
            client,
            req.user.tenantId,
            patientId,
            treatments
          );
          return newId;
        });
      } else {
        sessionId = await withTenantClient(req.user.tenantId, async (client) => {
          const result = await client.query(
            `SELECT id FROM clinical_sessions WHERE journal_entry_id = $1 LIMIT 1`,
            [posted.journalEntryId]
          );
          return result.rows[0]?.id || null;
        });
      }

      res.status(201).json({
        success: true,
        journalEntryId: posted.journalEntryId,
        sessionId,
        sessionTotal,
      });
    } catch (err) {
      if (err instanceof UnbalancedEntryError || err?.name === 'ClosedFiscalYearError') {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
      console.error('Clinical session commit failed:', err);
      res.status(500).json({ error: err.message || 'تعذّر ترحيل الجلسة' });
    }
  }
);

router.get(
  '/clinical/patient-file/:patientId',
  requireAuth,
  requirePermission('clinical', 'view'),
  async (req, res) => {
    try {
      const data = await withTenantClient(req.user.tenantId, async (client) => {
        const sessions = await client.query(
          `SELECT s.id, to_char(s.created_at, 'YYYY-MM-DD') AS session_date, s.total,
                  s.notes, d.name AS doctor_name
           FROM clinical_sessions s
           LEFT JOIN parties d ON d.id = s.doctor_id
           WHERE s.patient_id = $1
           ORDER BY s.created_at DESC`,
          [req.params.patientId]
        );
        const items = await client.query(
          `SELECT i.session_id, i.tooth, i.name, i.cost
           FROM clinical_session_items i
           JOIN clinical_sessions s ON s.id = i.session_id
           WHERE s.patient_id = $1
           ORDER BY i.name`,
          [req.params.patientId]
        );
        const images = await client.query(
          `SELECT img.id, img.session_id, img.kind, img.label, img.mime, img.sort_order,
                  img.ai_report, img.ai_analyzed_at, img.ai_model, img.created_at
           FROM clinical_session_images img
           JOIN clinical_sessions s ON s.id = img.session_id
           WHERE s.patient_id = $1
           ORDER BY img.sort_order ASC, img.created_at ASC`,
          [req.params.patientId]
        );

        const bySession = new Map();
        for (const session of sessions.rows) {
          bySession.set(session.id, {
            ...session,
            total: Number(session.total),
            items: [],
            images: [],
          });
        }
        const treatedTeeth = new Set();
        for (const item of items.rows) {
          const session = bySession.get(item.session_id);
          if (session) {
            session.items.push({ tooth: item.tooth, name: item.name, cost: Number(item.cost) });
          }
          if (item.tooth) treatedTeeth.add(String(item.tooth));
        }
        for (const img of images.rows) {
          const session = bySession.get(img.session_id);
          if (session) session.images.push(mapImageMeta(img));
        }
        const aiRow = await client.query(
          `SELECT ai_enabled, ai_api_key, ai_base_url, ai_vision_model, ai_provider
           FROM tenant_settings WHERE tenant_id = $1`,
          [req.user.tenantId]
        );
        return {
          sessions: [...bySession.values()],
          treatedTeeth: [...treatedTeeth],
          aiAnalysisAvailable: resolveAiConfig(aiRow.rows[0] || null).available,
        };
      });
      res.json(data);
    } catch (err) {
      console.error('Patient file failed:', err);
      res.status(500).json({ error: 'تعذّر جلب ملف المريض' });
    }
  }
);

router.post(
  '/clinical/sessions/:sessionId/images',
  requireAuth,
  requirePermission('clinical', 'edit'),
  imageUpload.array('files', 20),
  async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'يجب اختيار صورة واحدة على الأقل' });
    }
    for (const file of files) {
      if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
        return res.status(400).json({ error: 'صور الأشعة يجب أن تكون JPG أو PNG أو WebP' });
      }
    }

    try {
      const created = await withTenantClient(req.user.tenantId, async (client) => {
        const session = await client.query(
          `SELECT id FROM clinical_sessions WHERE id = $1`,
          [req.params.sessionId]
        );
        if (session.rowCount === 0) return null;

        const maxOrder = await client.query(
          `SELECT COALESCE(MAX(sort_order), -1) AS max_order
           FROM clinical_session_images WHERE session_id = $1`,
          [req.params.sessionId]
        );
        let aiReports = [];
        try {
          const raw = req.body?.aiReports;
          aiReports = typeof raw === 'string' ? JSON.parse(raw || '[]') : (Array.isArray(raw) ? raw : []);
        } catch {
          aiReports = [];
        }

        let nextOrder = Number(maxOrder.rows[0]?.max_order) + 1;
        const rows = [];
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const pre = aiReports[i] && typeof aiReports[i] === 'object' ? aiReports[i] : null;
          const report = pre?.report && String(pre.report).trim() ? String(pre.report).trim().slice(0, 20000) : null;
          const model = pre?.model && String(pre.model).trim() ? String(pre.model).trim().slice(0, 120) : null;
          const result = await client.query(
            `INSERT INTO clinical_session_images
               (session_id, tenant_id, kind, label, mime, bytes, sort_order,
                ai_report, ai_analyzed_at, ai_model)
             VALUES ($1, $2, 'XRAY', $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, kind, label, mime, sort_order, ai_report, ai_analyzed_at, ai_model, created_at`,
            [
              req.params.sessionId,
              req.user.tenantId,
              file.originalname || null,
              file.mimetype,
              file.buffer,
              nextOrder,
              report,
              report ? new Date() : null,
              report ? model : null,
            ]
          );
          nextOrder += 1;
          rows.push(mapImageMeta(result.rows[0]));
        }
        return rows;
      });

      if (!created) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      res.status(201).json({ success: true, images: created });
    } catch (err) {
      console.error('Uploading clinical images failed:', err);
      res.status(500).json({ error: 'تعذّر رفع صور الجلسة' });
    }
  }
);

router.get(
  '/clinical/sessions/:sessionId/images/:imageId',
  requireAuth,
  requirePermission('clinical', 'view'),
  async (req, res) => {
    try {
      const file = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT mime, bytes FROM clinical_session_images
           WHERE id = $1 AND session_id = $2`,
          [req.params.imageId, req.params.sessionId]
        );
        return result.rows[0] || null;
      });
      if (!file?.bytes) return res.status(404).json({ error: 'الصورة غير موجودة' });
      res.setHeader('Content-Type', file.mime || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(file.bytes);
    } catch (err) {
      console.error('Fetching clinical image failed:', err);
      res.status(500).json({ error: 'تعذّر جلب صورة الجلسة' });
    }
  }
);

router.delete(
  '/clinical/sessions/:sessionId/images/:imageId',
  requireAuth,
  requirePermission('clinical', 'edit'),
  async (req, res) => {
    try {
      const deleted = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `DELETE FROM clinical_session_images
           WHERE id = $1 AND session_id = $2
           RETURNING id`,
          [req.params.imageId, req.params.sessionId]
        );
        return result.rowCount > 0;
      });
      if (!deleted) return res.status(404).json({ error: 'الصورة غير موجودة' });
      res.json({ success: true });
    } catch (err) {
      console.error('Deleting clinical image failed:', err);
      res.status(500).json({ error: 'تعذّر حذف صورة الجلسة' });
    }
  }
);

router.post(
  '/clinical/sessions/:sessionId/images/:imageId/analyze',
  requireAuth,
  requirePermission('clinical', 'edit'),
  async (req, res) => {
    const locale = ['ar', 'en', 'he'].includes(req.body?.locale) ? req.body.locale : (req.user.locale || 'ar');
    try {
      const image = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `SELECT id, mime, bytes FROM clinical_session_images
           WHERE id = $1 AND session_id = $2`,
          [req.params.imageId, req.params.sessionId]
        );
        return result.rows[0] || null;
      });
      if (!image) return res.status(404).json({ error: 'الصورة غير موجودة' });

      const aiRow = await loadTenantAiRow(req.user.tenantId);
      const config = resolveAiConfig(aiRow);
      const { report, model } = await callVisionApi({
        mime: image.mime,
        bytes: image.bytes,
        locale,
        config,
      });

      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const result = await client.query(
          `UPDATE clinical_session_images
           SET ai_report = $3, ai_analyzed_at = now(), ai_model = $4
           WHERE id = $1 AND session_id = $2
           RETURNING id, kind, label, mime, sort_order, ai_report, ai_analyzed_at, ai_model, created_at`,
          [req.params.imageId, req.params.sessionId, report, model]
        );
        return result.rows[0] || null;
      });

      res.json({ success: true, image: mapImageMeta(updated) });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Clinical image AI analyze failed:', err);
      res.status(500).json({ error: 'تعذّر تحليل صورة الأشعة' });
    }
  }
);

router.get('/clinical/ai-status', requireAuth, requirePermission('clinical', 'view'), async (req, res) => {
  try {
    const aiRow = await loadTenantAiRow(req.user.tenantId);
    const config = resolveAiConfig(aiRow);
    res.json({
      available: config.available,
      enabled: Boolean(aiRow?.ai_enabled),
      hasKey: Boolean(aiRow?.ai_api_key && String(aiRow.ai_api_key).trim()) || Boolean(process.env.OPENAI_API_KEY),
    });
  } catch (err) {
    console.error('AI status failed:', err);
    res.status(500).json({ error: 'تعذّر التحقق من خدمة التحليل' });
  }
});

/** تحليل صورة أشعة قبل ترحيل الجلسة (لا تُحفظ في قاعدة البيانات) */
router.post(
  '/clinical/ai/analyze-preview',
  requireAuth,
  requirePermission('clinical', 'edit'),
  imageUpload.single('file'),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'يجب اختيار صورة للتحليل' });
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: 'صور الأشعة يجب أن تكون JPG أو PNG أو WebP' });
    }
    const locale = ['ar', 'en', 'he'].includes(req.body?.locale) ? req.body.locale : (req.user.locale || 'ar');
    try {
      const aiRow = await loadTenantAiRow(req.user.tenantId);
      const config = resolveAiConfig(aiRow);
      const { report, model } = await callVisionApi({
        mime: file.mimetype,
        bytes: file.buffer,
        locale,
        config,
      });
      res.json({ success: true, report, model });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Clinical preview AI analyze failed:', err);
      res.status(500).json({ error: 'تعذّر تحليل صورة الأشعة' });
    }
  }
);

module.exports = router;
