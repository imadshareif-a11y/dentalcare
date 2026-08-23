// routes/patients.js
const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { nextAccountCode } = require('../settings/numbering');
const { syncPartyAccountName } = require('../parties/syncAccountName');
const { parseBirthDate, mapPatientRow } = require('../parties/patientDemographics');
const { insertChartAccount } = require('../accounting/chartAccounts');

function parseGender(value) {
  if (value === null || value === undefined || value === '') return null;
  const gender = String(value).toUpperCase();
  if (!['MALE', 'FEMALE'].includes(gender)) {
    throw Object.assign(new Error('الجنس غير صالح'), { statusCode: 400 });
  }
  return gender;
}

function parseDemographics(body) {
  return {
    birthDate: parseBirthDate(body.birthDate),
    gender: parseGender(body.gender),
  };
}

router.post(
  '/patients',
  requireAuth,
  requirePermission('patients'),
  async (req, res) => {
    const { name, phone, address, medicalNotes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم المريض مطلوب' });
    }

    let birthDate;
    let gender;
    try {
      ({ birthDate, gender } = parseDemographics(req.body));
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    try {
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const accountCode = await nextAccountCode(client, req.user.tenantId, 'patients');
        const accountId = await insertChartAccount(client, req.user.tenantId, {
          accountCode,
          accountName: `ذمة: ${name}`,
          accountNameAr: `ذمة: ${name}`,
          accountNameEn: `Balance: ${name}`,
          accountNameHe: `יתרת: ${name}`,
          accountType: 'RECEIVABLE',
          currencyId: req.body.currencyId || null,
        });

        const partyResult = await client.query(
          `INSERT INTO parties
             (tenant_id, party_type, name, phone, address, medical_notes, birth_date, gender, account_id)
           VALUES ($1, 'PATIENT', $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            req.user.tenantId, name.trim(), phone || null, address || null,
            medicalNotes || null, birthDate, gender, accountId,
          ]
        );

        return { patientId: partyResult.rows[0].id, accountId };
      });

      res.status(201).json({ success: true, ...result });
    } catch (err) {
      console.error('Patient creation failed:', err);
      res.status(500).json({ error: 'تعذّر تسجيل المريض' });
    }
  }
);

router.patch(
  '/patients/:id',
  requireAuth,
  requirePermission('patients', 'edit'),
  async (req, res) => {
    const { name, phone, address, medicalNotes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم المريض مطلوب' });
    }

    let birthDate;
    let gender;
    try {
      ({ birthDate, gender } = parseDemographics(req.body));
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    try {
      await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, account_id FROM parties WHERE id = $1 AND party_type = 'PATIENT'`,
          [req.params.id]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('المريض غير موجود'), { statusCode: 404 });
        }
        const { account_id: accountId } = existing.rows[0];
        await client.query(
          `UPDATE parties
           SET name = $2, phone = $3, address = $4, medical_notes = $5, birth_date = $6, gender = $7
           WHERE id = $1`,
          [
            req.params.id, name.trim(), phone || null, address || null,
            medicalNotes || null, birthDate, gender,
          ]
        );
        await syncPartyAccountName(client, accountId, 'PATIENT', name.trim());
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 404) return res.status(404).json({ error: err.message });
      console.error('Patient update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث بيانات المريض' });
    }
  }
);

router.get('/patients', requireAuth, requirePermission('patients', 'view'), async (req, res) => {
  try {
    const patients = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone, p.address, p.medical_notes,
          to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date,
          p.gender, p.account_id,
          COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
        FROM parties p
        LEFT JOIN journal_entry_lines l ON l.account_id = p.account_id
        WHERE p.tenant_id = $1 AND p.party_type = 'PATIENT'
        GROUP BY p.id, p.name, p.phone, p.address, p.medical_notes, p.birth_date, p.gender, p.account_id
        ORDER BY p.name ASC
      `, [req.user.tenantId]);
      return result.rows.map(mapPatientRow);
    });
    res.json(patients);
  } catch (err) {
    console.error('Fetching patients failed:', err);
    res.status(500).json({ error: 'تعذّر جلب قائمة المرضى' });
  }
});

module.exports = router;
