const {
  TOOTH_CONDITIONS,
  normalizeConditionCode,
  inferConditionFromTreatmentName,
  normalizeToothFdi,
} = require('../lib/toothConditions');

async function assertPatient(client, patientId) {
  const result = await client.query(
    `SELECT id FROM parties WHERE id = $1 AND party_type = 'PATIENT'`,
    [patientId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('المريض غير موجود'), { statusCode: 404 });
  }
}

async function backfillFromSessions(client, tenantId, patientId) {
  const existing = await client.query(
    `SELECT 1 FROM tooth_chart_entries
     WHERE tenant_id = $1 AND patient_id = $2 AND status = 'ACTIVE'
     LIMIT 1`,
    [tenantId, patientId]
  );
  if (existing.rowCount > 0) return;

  const rows = await client.query(
    `SELECT i.tooth, i.name, s.created_at
     FROM clinical_session_items i
     JOIN clinical_sessions s ON s.id = i.session_id
     WHERE s.patient_id = $1 AND s.tenant_id = $2 AND i.tooth IS NOT NULL
     ORDER BY s.created_at ASC`,
    [patientId, tenantId]
  );

  const latestByTooth = new Map();
  for (const row of rows.rows) {
    const tooth = normalizeToothFdi(row.tooth);
    if (!tooth) continue;
    const code = inferConditionFromTreatmentName(row.name);
    if (!code) continue;
    latestByTooth.set(tooth, { code, name: row.name });
  }

  for (const [tooth, { code }] of latestByTooth) {
    await client.query(
      `INSERT INTO tooth_chart_entries
         (tenant_id, patient_id, tooth_fdi, condition_code, status, source)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'SESSION')`,
      [tenantId, patientId, tooth, code]
    );
  }
}

function buildTeethMap(currentRows, plannedRows) {
  const teeth = {};
  for (const row of currentRows) {
    const tooth = String(row.tooth_fdi);
    if (!teeth[tooth]) teeth[tooth] = { current: null, planned: [], currentNotes: null };
    teeth[tooth].current = row.condition_code;
    teeth[tooth].currentNotes = row.notes || null;
  }
  for (const row of plannedRows) {
    const tooth = String(row.tooth_fdi);
    if (!teeth[tooth]) teeth[tooth] = { current: null, planned: [], currentNotes: null };
    teeth[tooth].planned.push({
      id: row.id,
      conditionCode: row.condition_code,
      name: row.name,
      cost: Number(row.cost),
      sortOrder: row.sort_order,
      status: row.status,
    });
  }
  for (const tooth of Object.keys(teeth)) {
    teeth[tooth].planned.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return teeth;
}

async function loadToothChart(client, tenantId, patientId) {
  await backfillFromSessions(client, tenantId, patientId);

  const current = await client.query(
    `SELECT tooth_fdi, condition_code, notes
     FROM tooth_chart_entries
     WHERE tenant_id = $1 AND patient_id = $2 AND status = 'ACTIVE'
     ORDER BY tooth_fdi`,
    [tenantId, patientId]
  );

  const plan = await client.query(
    `SELECT p.id AS plan_id
     FROM treatment_plans p
     WHERE p.tenant_id = $1 AND p.patient_id = $2 AND p.status = 'ACTIVE'
     LIMIT 1`,
    [tenantId, patientId]
  );

  let plannedRows = { rows: [] };
  if (plan.rowCount > 0) {
    plannedRows = await client.query(
      `SELECT id, tooth_fdi, condition_code, name, cost, sort_order, status
       FROM treatment_plan_items
       WHERE plan_id = $1 AND status = 'PLANNED'
       ORDER BY sort_order ASC, created_at ASC`,
      [plan.rows[0].plan_id]
    );
  }

  return {
    conditions: TOOTH_CONDITIONS,
    teeth: buildTeethMap(current.rows, plannedRows.rows),
  };
}

async function setToothCurrent(client, tenantId, patientId, toothRaw, conditionCodeRaw, notes) {
  const tooth = normalizeToothFdi(toothRaw);
  if (!tooth) throw Object.assign(new Error('رقم السن غير صالح'), { statusCode: 400 });

  const conditionCode = normalizeConditionCode(conditionCodeRaw);
  if (!conditionCode) {
    throw Object.assign(new Error('حالة السن غير صالحة'), { statusCode: 400 });
  }

  await client.query(
    `UPDATE tooth_chart_entries
     SET status = 'SUPERSEDED', updated_at = now()
     WHERE tenant_id = $1 AND patient_id = $2 AND tooth_fdi = $3 AND status = 'ACTIVE'`,
    [tenantId, patientId, tooth]
  );

  if (conditionCode === 'HEALTHY') {
    return { tooth, current: null };
  }

  await client.query(
    `INSERT INTO tooth_chart_entries
       (tenant_id, patient_id, tooth_fdi, condition_code, status, source, notes)
     VALUES ($1, $2, $3, $4, 'ACTIVE', 'MANUAL', $5)`,
    [tenantId, patientId, tooth, conditionCode, notes || null]
  );

  return { tooth, current: conditionCode };
}

async function loadTreatmentPlan(client, tenantId, patientId) {
  const plan = await client.query(
    `SELECT id, notes, created_at, updated_at
     FROM treatment_plans
     WHERE tenant_id = $1 AND patient_id = $2 AND status = 'ACTIVE'
     LIMIT 1`,
    [tenantId, patientId]
  );

  if (plan.rowCount === 0) {
    return { planId: null, notes: '', items: [] };
  }

  const planId = plan.rows[0].id;
  const items = await client.query(
    `SELECT id, tooth_fdi, condition_code, catalog_id, name, cost, sort_order, status
     FROM treatment_plan_items
     WHERE plan_id = $1 AND status <> 'CANCELLED'
     ORDER BY sort_order ASC, created_at ASC`,
    [planId]
  );

  return {
    planId,
    notes: plan.rows[0].notes || '',
    items: items.rows.map((row) => ({
      id: row.id,
      tooth: row.tooth_fdi,
      conditionCode: row.condition_code,
      catalogId: row.catalog_id,
      name: row.name,
      cost: Number(row.cost),
      sortOrder: row.sort_order,
      status: row.status,
    })),
  };
}

async function saveTreatmentPlan(client, tenantId, patientId, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  const existing = await client.query(
    `SELECT id FROM treatment_plans
     WHERE tenant_id = $1 AND patient_id = $2 AND status = 'ACTIVE'
     LIMIT 1`,
    [tenantId, patientId]
  );

  let planId;
  if (existing.rowCount === 0) {
    const created = await client.query(
      `INSERT INTO treatment_plans (tenant_id, patient_id, status, notes)
       VALUES ($1, $2, 'ACTIVE', $3)
       RETURNING id`,
      [tenantId, patientId, notes || null]
    );
    planId = created.rows[0].id;
  } else {
    planId = existing.rows[0].id;
    await client.query(
      `UPDATE treatment_plans SET notes = $2, updated_at = now() WHERE id = $1`,
      [planId, notes || null]
    );
    await client.query(
      `DELETE FROM treatment_plan_items WHERE plan_id = $1 AND status = 'PLANNED'`,
      [planId]
    );
  }

  let order = 0;
  for (const item of items) {
    const tooth = normalizeToothFdi(item.tooth ?? item.toothFdi);
    const conditionCode = normalizeConditionCode(
      item.conditionCode ?? inferConditionFromTreatmentName(item.name)
    );
    const name = String(item.name || '').trim();
    const cost = Number(item.cost);
    if (!tooth || !conditionCode || !name) continue;

    await client.query(
      `INSERT INTO treatment_plan_items
         (tenant_id, plan_id, tooth_fdi, condition_code, catalog_id, name, cost, sort_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PLANNED')`,
      [
        tenantId,
        planId,
        tooth,
        conditionCode,
        item.catalogId || null,
        name,
        Number.isFinite(cost) ? cost : 0,
        order,
      ]
    );
    order += 1;
  }

  return loadTreatmentPlan(client, tenantId, patientId);
}

async function resolveTreatmentCondition(client, item) {
  if (item.conditionCode) {
    const code = normalizeConditionCode(item.conditionCode);
    if (code) return code;
  }
  if (item.catalogId) {
    const cat = await client.query(
      `SELECT condition_code, name FROM treatment_catalog WHERE id = $1`,
      [item.catalogId]
    );
    const row = cat.rows[0];
    if (row?.condition_code) {
      const code = normalizeConditionCode(row.condition_code);
      if (code) return code;
    }
    if (row?.name) {
      const inferred = inferConditionFromTreatmentName(row.name);
      if (inferred) return inferred;
    }
  }
  return inferConditionFromTreatmentName(item.name);
}

async function completePlanItem(client, tenantId, patientId, { planItemId, tooth, conditionCode }) {
  if (planItemId) {
    await client.query(
      `UPDATE treatment_plan_items tpi
       SET status = 'COMPLETED', updated_at = now()
       FROM treatment_plans tp
       WHERE tpi.plan_id = tp.id
         AND tpi.id = $1 AND tpi.tenant_id = $2
         AND tp.patient_id = $3 AND tpi.status = 'PLANNED'`,
      [planItemId, tenantId, patientId]
    );
    return;
  }
  await client.query(
    `UPDATE treatment_plan_items tpi
     SET status = 'COMPLETED', updated_at = now()
     FROM treatment_plans tp
     WHERE tpi.plan_id = tp.id
       AND tp.tenant_id = $1 AND tp.patient_id = $2 AND tp.status = 'ACTIVE'
       AND tpi.tooth_fdi = $3 AND tpi.condition_code = $4 AND tpi.status = 'PLANNED'
       AND tpi.id = (
         SELECT tpi2.id
         FROM treatment_plan_items tpi2
         WHERE tpi2.plan_id = tp.id
           AND tpi2.tooth_fdi = $3 AND tpi2.condition_code = $4 AND tpi2.status = 'PLANNED'
         ORDER BY tpi2.sort_order ASC, tpi2.created_at ASC
         LIMIT 1
       )`,
    [tenantId, patientId, tooth, conditionCode]
  );
}

async function applySessionTreatmentsToChart(client, tenantId, patientId, treatments) {
  for (const item of treatments) {
    const tooth = normalizeToothFdi(item.tooth);
    if (!tooth) continue;

    const conditionCode = await resolveTreatmentCondition(client, item);
    if (!conditionCode || conditionCode === 'HEALTHY') continue;

    await setToothCurrent(client, tenantId, patientId, tooth, conditionCode, null);
    await completePlanItem(client, tenantId, patientId, {
      planItemId: item.planItemId || null,
      tooth,
      conditionCode,
    });
  }
}

async function loadPlanReport(client, tenantId, patientId) {
  const plan = await loadTreatmentPlan(client, tenantId, patientId);
  const planned = (plan.items || []).filter((i) => i.status === 'PLANNED');
  const completed = (plan.items || []).filter((i) => i.status === 'COMPLETED');

  const sessions = await client.query(
    `SELECT i.tooth, i.name, i.cost, s.created_at
     FROM clinical_session_items i
     JOIN clinical_sessions s ON s.id = i.session_id
     WHERE s.patient_id = $1 AND s.tenant_id = $2
     ORDER BY s.created_at DESC`,
    [patientId, tenantId]
  );

  const plannedTotal = planned.reduce((sum, i) => sum + Number(i.cost || 0), 0);
  const completedPlanTotal = completed.reduce((sum, i) => sum + Number(i.cost || 0), 0);
  const executedTotal = sessions.rows.reduce((sum, r) => sum + Number(r.cost || 0), 0);

  return {
    planId: plan.planId,
    notes: plan.notes,
    planned,
    completed,
    sessions: sessions.rows.map((r) => ({
      tooth: r.tooth,
      name: r.name,
      cost: Number(r.cost),
      date: r.created_at,
    })),
    totals: {
      plannedRemaining: plannedTotal,
      plannedCompleted: completedPlanTotal,
      sessionExecuted: executedTotal,
    },
  };
}

module.exports = {
  assertPatient,
  loadToothChart,
  setToothCurrent,
  loadTreatmentPlan,
  saveTreatmentPlan,
  applySessionTreatmentsToChart,
  loadPlanReport,
};
