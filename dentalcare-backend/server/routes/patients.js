// routes/patients.js
const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { withTenantClient } = require('../db/pool');
const { nextAccountCode } = require('../settings/numbering');
const { syncPartyAccountName } = require('../parties/syncAccountName');
const { parseBirthDate, mapPatientRow } = require('../parties/patientDemographics');
const { insertChartAccount } = require('../accounting/chartAccounts');
const { deletePartyIfNoMovements } = require('../parties/deleteParty');
const { ensurePatientDependentsSchema } = require('../db/ensurePatientDependents');
const { getAccountBalance, postJournalEntry } = require('../accounting/engine');

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

async function resolveGuardian(client, tenantId, billingPartyId) {
  if (billingPartyId == null || billingPartyId === '') return null;
  const result = await client.query(
    `SELECT id, name, account_id, billing_party_id
     FROM parties
     WHERE id = $1 AND tenant_id = $2 AND party_type = 'PATIENT'`,
    [billingPartyId, tenantId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('ولي الأمر غير موجود'), { statusCode: 400 });
  }
  const guardian = result.rows[0];
  if (!guardian.account_id) {
    throw Object.assign(new Error('ولي الأمر ليس له حساب ذمة'), { statusCode: 400 });
  }
  if (guardian.billing_party_id) {
    throw Object.assign(
      new Error('لا يمكن ربط مريض بولي هو نفسه تابع (مستوى واحد فقط)'),
      { statusCode: 400 }
    );
  }
  return guardian;
}

async function assertCanBecomeDependent(client, tenantId, patientId) {
  const deps = await client.query(
    `SELECT 1 FROM parties
     WHERE tenant_id = $1 AND party_type = 'PATIENT' AND billing_party_id = $2
     LIMIT 1`,
    [tenantId, patientId]
  );
  if (deps.rowCount > 0) {
    throw Object.assign(
      new Error('لا يمكن جعل هذا المريض تابعًا لأنه ولي لمرضى آخرين'),
      { statusCode: 400 }
    );
  }
}

async function linkPatientToGuardian(client, tenantId, patientId, accountId, guardian) {
  await client.query(
    `UPDATE parties
     SET billing_party_id = $2
     WHERE id = $1 AND tenant_id = $3`,
    [patientId, guardian?.id || null, tenantId]
  );
  await client.query(
    `UPDATE chart_of_accounts
     SET parent_id = $2
     WHERE id = $1 AND tenant_id = $3`,
    [accountId, guardian?.account_id || null, tenantId]
  );
}

router.post(
  '/patients',
  requireAuth,
  requirePermission('patients'),
  async (req, res) => {
    const { name, phone, address, medicalNotes, billingPartyId } = req.body;

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
      await ensurePatientDependentsSchema();
      const result = await withTenantClient(req.user.tenantId, async (client) => {
        const guardian = await resolveGuardian(client, req.user.tenantId, billingPartyId);
        const accountCode = await nextAccountCode(client, req.user.tenantId, 'patients');
        const accountId = await insertChartAccount(client, req.user.tenantId, {
          accountCode,
          accountName: `ذمة: ${name}`,
          accountNameAr: `ذمة: ${name}`,
          accountNameEn: `Balance: ${name}`,
          accountNameHe: `יתרת: ${name}`,
          accountType: 'RECEIVABLE',
          parentId: guardian?.account_id || null,
          currencyId: req.body.currencyId || null,
        });

        const partyResult = await client.query(
          `INSERT INTO parties
             (tenant_id, party_type, name, phone, address, medical_notes, birth_date, gender,
              account_id, billing_party_id)
           VALUES ($1, 'PATIENT', $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            req.user.tenantId, name.trim(), phone || null, address || null,
            medicalNotes || null, birthDate, gender, accountId,
            guardian?.id || null,
          ]
        );

        return {
          patientId: partyResult.rows[0].id,
          accountId,
          billingPartyId: guardian?.id || null,
        };
      });

      res.status(201).json({ success: true, ...result });
    } catch (err) {
      if (err.statusCode === 400) return res.status(400).json({ error: err.message });
      console.error('Patient creation failed:', err);
      if (err.code === '23502') {
        return res.status(500).json({
          error: 'تعذّر تسجيل المريض: حقل مطلوب ناقص في قاعدة البيانات',
          column: err.column || null,
        });
      }
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

    const wantsBillingUpdate = Object.prototype.hasOwnProperty.call(req.body, 'billingPartyId');

    try {
      await ensurePatientDependentsSchema();
      let balanceTransfer = null;

      const updated = await withTenantClient(req.user.tenantId, async (client) => {
        const existing = await client.query(
          `SELECT id, name, account_id, billing_party_id
           FROM parties
           WHERE id = $1 AND tenant_id = $2 AND party_type = 'PATIENT'`,
          [req.params.id, req.user.tenantId]
        );
        if (existing.rowCount === 0) {
          throw Object.assign(new Error('المريض غير موجود'), { statusCode: 404 });
        }
        const row = existing.rows[0];
        const accountId = row.account_id;

        await client.query(
          `UPDATE parties
           SET name = $2, phone = $3, address = $4, medical_notes = $5, birth_date = $6, gender = $7
           WHERE id = $1 AND tenant_id = $8`,
          [
            req.params.id, name.trim(), phone || null, address || null,
            medicalNotes || null, birthDate, gender, req.user.tenantId,
          ]
        );
        await syncPartyAccountName(client, accountId, 'PATIENT', name.trim());

        let guardian = null;
        if (wantsBillingUpdate) {
          const nextBillingId = req.body.billingPartyId || null;
          if (nextBillingId && String(nextBillingId) === String(req.params.id)) {
            throw Object.assign(new Error('لا يمكن ربط المريض بنفسه'), { statusCode: 400 });
          }
          if (nextBillingId) {
            await assertCanBecomeDependent(client, req.user.tenantId, req.params.id);
            guardian = await resolveGuardian(client, req.user.tenantId, nextBillingId);
          }
          const prevBilling = row.billing_party_id || null;
          const nextBilling = guardian?.id || null;
          if (String(prevBilling || '') !== String(nextBilling || '')) {
            await linkPatientToGuardian(
              client,
              req.user.tenantId,
              req.params.id,
              accountId,
              guardian
            );
            if (guardian && accountId) {
              balanceTransfer = {
                childAccountId: accountId,
                guardianAccountId: guardian.account_id,
                childName: name.trim(),
                guardianName: guardian.name,
              };
            }
          }
        }

        return {
          billingPartyId: wantsBillingUpdate
            ? (guardian?.id || null)
            : (row.billing_party_id || null),
          balanceTransfer,
        };
      });

      let transferredAmount = 0;
      if (updated.balanceTransfer) {
        const bal = await getAccountBalance({
          tenantId: req.user.tenantId,
          accountId: updated.balanceTransfer.childAccountId,
        });
        const amount = Math.round(Number(bal) * 100) / 100;
        if (Math.abs(amount) >= 0.005) {
          const abs = Math.abs(amount);
          const lines = amount > 0
            ? [
                {
                  accountId: updated.balanceTransfer.guardianAccountId,
                  debit: abs,
                  lineMemo: `نقل ذمة تابع: ${updated.balanceTransfer.childName}`,
                },
                {
                  accountId: updated.balanceTransfer.childAccountId,
                  credit: abs,
                  lineMemo: 'نقل إلى ذمة الولي',
                },
              ]
            : [
                {
                  accountId: updated.balanceTransfer.childAccountId,
                  debit: abs,
                  lineMemo: 'تسوية بعد النقل من الولي',
                },
                {
                  accountId: updated.balanceTransfer.guardianAccountId,
                  credit: abs,
                  lineMemo: `نقل ذمة تابع: ${updated.balanceTransfer.childName}`,
                },
              ];
          await postJournalEntry({
            tenantId: req.user.tenantId,
            userId: req.user.userId,
            sourceType: 'JOURNAL',
            memo: `نقل ذمة ${updated.balanceTransfer.childName} إلى ولي الأمر ${updated.balanceTransfer.guardianName}`,
            lines,
          });
          transferredAmount = amount;
        }
      }

      res.json({
        success: true,
        billingPartyId: updated.billingPartyId,
        transferredAmount,
      });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error('Patient update failed:', err);
      res.status(500).json({ error: 'تعذّر تحديث بيانات المريض' });
    }
  }
);

router.delete(
  '/patients/:id',
  requireAuth,
  requirePermission('patients', 'edit'),
  async (req, res) => {
    try {
      await ensurePatientDependentsSchema();
      await withTenantClient(req.user.tenantId, async (client) => {
        await deletePartyIfNoMovements(client, {
          tenantId: req.user.tenantId,
          partyId: req.params.id,
          partyType: 'PATIENT',
        });
      });
      res.json({ success: true });
    } catch (err) {
      if (err.statusCode === 400 || err.statusCode === 404) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      if (err.code === '23503') {
        return res.status(400).json({
          error: 'لا يمكن حذف الذمة لوجود بيانات مرتبطة بها (جلسات أو مواعيد أو غيرها)',
        });
      }
      console.error('Patient delete failed:', err);
      res.status(500).json({ error: 'تعذّر حذف المريض' });
    }
  }
);

router.get('/patients', requireAuth, requirePermission('patients', 'view'), async (req, res) => {
  try {
    await ensurePatientDependentsSchema();
    const patients = await withTenantClient(req.user.tenantId, async (client) => {
      const result = await client.query(`
        SELECT
          p.id, p.name, p.phone, p.address, p.medical_notes,
          to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date,
          p.gender, p.account_id,
          p.billing_party_id,
          g.name AS billing_party_name,
          g.account_id AS billing_account_id,
          (p.billing_party_id IS NOT NULL) AS is_dependent,
          (
            SELECT COUNT(*)::int FROM parties d
            WHERE d.tenant_id = p.tenant_id
              AND d.party_type = 'PATIENT'
              AND d.billing_party_id = p.id
          ) AS dependents_count,
          EXISTS (
            SELECT 1 FROM journal_entry_lines lm
            WHERE lm.account_id = p.account_id AND lm.tenant_id = p.tenant_id
            LIMIT 1
          ) AS has_movements,
          COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance
        FROM parties p
        LEFT JOIN parties g
          ON g.id = p.billing_party_id
         AND g.tenant_id = p.tenant_id
         AND g.party_type = 'PATIENT'
        LEFT JOIN parties bill
          ON bill.id = COALESCE(p.billing_party_id, p.id)
         AND bill.tenant_id = p.tenant_id
        LEFT JOIN journal_entry_lines l
          ON l.account_id = bill.account_id
         AND l.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1 AND p.party_type = 'PATIENT'
        GROUP BY
          p.id, p.name, p.phone, p.address, p.medical_notes, p.birth_date, p.gender,
          p.account_id, p.billing_party_id, g.name, g.account_id, p.tenant_id
        ORDER BY
          COALESCE(g.name, p.name) ASC,
          (p.billing_party_id IS NOT NULL) ASC,
          p.name ASC
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
