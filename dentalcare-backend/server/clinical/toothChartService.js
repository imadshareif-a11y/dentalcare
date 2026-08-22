const {
  TOOTH_CONDITIONS,
  normalizeConditionCode,
  inferConditionFromTreatmentName,
  normalizeToothFdi,
} = require('../lib/toothConditions');
const { listToothConditions } = require('../db/ensureToothConditions');

async function assertPatient(client, patientId) {
  const result = await client.query(
    `SELECT id FROM parties WHERE id = $1 AND party_type = 'PATIENT'`,
    [patientId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('المريض غير موجود'), { statusCode: 404 });
  }
}

async function assertDoctor(client, doctorId) {
  if (!doctorId) return null;
  const result = await client.query(
    `SELECT id FROM parties WHERE id = $1::uuid AND party_type = 'DOCTOR'`,
    [doctorId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('الطبيب غير موجود'), { statusCode: 400 });
  }
  return result.rows[0].id;
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
      doctorId: row.doctor_id || null,
      doctorName: row.doctor_name || null,
      catalogId: row.catalog_id || null,
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
      `SELECT tpi.id, tpi.tooth_fdi, tpi.condition_code, tpi.catalog_id, tpi.name, tpi.cost,
              tpi.sort_order, tpi.status, tpi.doctor_id, d.name AS doctor_name
       FROM treatment_plan_items tpi
       LEFT JOIN parties d ON d.id = tpi.doctor_id
       WHERE tpi.plan_id = $1 AND tpi.status IN ('PLANNED', 'IN_PROGRESS')
       ORDER BY tpi.sort_order ASC, tpi.created_at ASC`,
      [plan.rows[0].plan_id]
    );
  }

  let conditions = TOOTH_CONDITIONS;
  try {
    const rows = await listToothConditions(client, tenantId, { activeOnly: true });
    if (rows.length) {
      conditions = rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        name_en: r.name_en,
        name_he: r.name_he,
        category: r.category,
        color: r.color,
        sort_order: r.sort_order,
        is_active: r.is_active,
        is_system: r.is_system,
      }));
    }
  } catch (err) {
    console.warn('tooth conditions load fallback:', err.message);
  }

  return {
    conditions,
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

async function loadPlanItemBilledMap(client, tenantId, itemIds) {
  if (!itemIds.length) return new Map();
  const billed = await client.query(
    `SELECT plan_item_id, COALESCE(SUM(cost), 0)::float AS billed
     FROM clinical_session_items
     WHERE tenant_id = $1 AND plan_item_id = ANY($2::uuid[])
     GROUP BY plan_item_id`,
    [tenantId, itemIds]
  );
  return new Map(billed.rows.map((r) => [String(r.plan_item_id), Number(r.billed) || 0]));
}

function mapPlanItemRow(row, billedMap) {
  const cost = Number(row.cost) || 0;
  const billedAmount = billedMap.get(String(row.id)) || 0;
  const remainingCost = Math.max(0, Math.round((cost - billedAmount) * 100) / 100);
  return {
    id: row.id,
    tooth: row.tooth_fdi,
    conditionCode: row.condition_code,
    catalogId: row.catalog_id,
    name: row.name,
    cost,
    billedAmount,
    remainingCost,
    sortOrder: row.sort_order,
    status: row.status,
    doctorId: row.doctor_id || null,
    doctorName: row.doctor_name || null,
  };
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
    `SELECT tpi.id, tpi.tooth_fdi, tpi.condition_code, tpi.catalog_id, tpi.name, tpi.cost,
            tpi.sort_order, tpi.status, tpi.doctor_id, d.name AS doctor_name
     FROM treatment_plan_items tpi
     LEFT JOIN parties d ON d.id = tpi.doctor_id
     WHERE tpi.plan_id = $1 AND tpi.status <> 'CANCELLED'
     ORDER BY tpi.sort_order ASC, tpi.created_at ASC`,
    [planId]
  );

  const billedMap = await loadPlanItemBilledMap(
    client,
    tenantId,
    items.rows.map((r) => r.id)
  );

  return {
    planId,
    notes: plan.rows[0].notes || '',
    items: items.rows.map((row) => mapPlanItemRow(row, billedMap)),
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
  }

  const existingOpen = await client.query(
    `SELECT id FROM treatment_plan_items
     WHERE plan_id = $1 AND status IN ('PLANNED', 'IN_PROGRESS')`,
    [planId]
  );
  const existingIds = new Set(existingOpen.rows.map((r) => String(r.id)));
  const keepIds = [];

  let order = 0;
  for (const item of items) {
    const status = String(item.status || 'PLANNED').toUpperCase();
    if (status === 'COMPLETED' || status === 'CANCELLED') continue;

    const tooth = normalizeToothFdi(item.tooth ?? item.toothFdi);
    const conditionCode = normalizeConditionCode(
      item.conditionCode ?? inferConditionFromTreatmentName(item.name)
    );
    const name = String(item.name || '').trim();
    const cost = Number(item.cost);
    if (!tooth || !conditionCode || !name) continue;

    const rawId = typeof item.id === 'string' ? item.id.trim() : '';
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId);
    const costValue = Number.isFinite(cost) ? cost : 0;
    const catalogId = item.catalogId || null;
    const doctorId = await assertDoctor(client, item.doctorId || item.doctor_id || null);
    if (!doctorId) {
      throw Object.assign(new Error('يجب تحديد الطبيب لكل بند في الخطة العلاجية'), { statusCode: 400 });
    }

    if (isUuid && existingIds.has(rawId)) {
      await client.query(
        `UPDATE treatment_plan_items
         SET tooth_fdi = $2,
             condition_code = $3,
             catalog_id = $4,
             name = $5,
             cost = $6,
             sort_order = $7,
             doctor_id = $8,
             updated_at = now()
         WHERE id = $1 AND plan_id = $9 AND status IN ('PLANNED', 'IN_PROGRESS')`,
        [rawId, tooth, conditionCode, catalogId, name, costValue, order, doctorId, planId]
      );
      keepIds.push(rawId);
    } else {
      const inserted = await client.query(
        `INSERT INTO treatment_plan_items
           (tenant_id, plan_id, tooth_fdi, condition_code, catalog_id, name, cost, sort_order, status, doctor_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PLANNED', $9)
         RETURNING id`,
        [tenantId, planId, tooth, conditionCode, catalogId, name, costValue, order, doctorId]
      );
      keepIds.push(String(inserted.rows[0].id));
    }
    order += 1;
  }

  if (keepIds.length === 0) {
    await client.query(
      `DELETE FROM treatment_plan_items
       WHERE plan_id = $1 AND status IN ('PLANNED', 'IN_PROGRESS')`,
      [planId]
    );
  } else {
    await client.query(
      `DELETE FROM treatment_plan_items
       WHERE plan_id = $1 AND status IN ('PLANNED', 'IN_PROGRESS') AND NOT (id = ANY($2::uuid[]))`,
      [planId, keepIds]
    );
  }

  return loadTreatmentPlan(client, tenantId, patientId);
}

async function updatePlanItemDoctor(client, tenantId, patientId, itemId, doctorIdRaw) {
  const doctorId = await assertDoctor(client, doctorIdRaw);
  if (!doctorId) {
    throw Object.assign(new Error('يجب تحديد الطبيب'), { statusCode: 400 });
  }
  const result = await client.query(
    `UPDATE treatment_plan_items tpi
     SET doctor_id = $1, updated_at = now()
     FROM treatment_plans tp
     WHERE tpi.plan_id = tp.id
       AND tpi.id = $2::uuid
       AND tpi.tenant_id = $3
       AND tp.patient_id = $4
       AND tpi.status IN ('PLANNED', 'IN_PROGRESS')
     RETURNING tpi.id, tpi.doctor_id`,
    [doctorId, itemId, tenantId, patientId]
  );
  if (result.rowCount === 0) {
    throw Object.assign(new Error('بند الخطة غير موجود'), { statusCode: 404 });
  }
  const doctor = await client.query(
    `SELECT name FROM parties WHERE id = $1`,
    [doctorId]
  );
  return {
    id: result.rows[0].id,
    doctorId: result.rows[0].doctor_id,
    doctorName: doctor.rows[0]?.name || null,
  };
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
         AND tp.patient_id = $3 AND tpi.status IN ('PLANNED', 'IN_PROGRESS')`,
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
       AND tpi.tooth_fdi = $3 AND tpi.condition_code = $4 AND tpi.status IN ('PLANNED', 'IN_PROGRESS')
       AND tpi.id = (
         SELECT tpi2.id
         FROM treatment_plan_items tpi2
         WHERE tpi2.plan_id = tp.id
           AND tpi2.tooth_fdi = $3 AND tpi2.condition_code = $4
           AND tpi2.status IN ('PLANNED', 'IN_PROGRESS')
         ORDER BY tpi2.sort_order ASC, tpi2.created_at ASC
         LIMIT 1
       )`,
    [tenantId, patientId, tooth, conditionCode]
  );
}

async function markPlanItemInProgress(client, tenantId, patientId, planItemId) {
  if (!planItemId) return;
  await client.query(
    `UPDATE treatment_plan_items tpi
     SET status = 'IN_PROGRESS', updated_at = now()
     FROM treatment_plans tp
     WHERE tpi.plan_id = tp.id
       AND tpi.id = $1 AND tpi.tenant_id = $2
       AND tp.patient_id = $3 AND tpi.status IN ('PLANNED', 'IN_PROGRESS')`,
    [planItemId, tenantId, patientId]
  );
}

async function completePlanItemAndChart(client, tenantId, patientId, itemId) {
  const row = await client.query(
    `SELECT tpi.id, tpi.tooth_fdi, tpi.condition_code, tpi.name, tpi.catalog_id, tpi.status
     FROM treatment_plan_items tpi
     JOIN treatment_plans tp ON tp.id = tpi.plan_id
     WHERE tpi.id = $1::uuid AND tpi.tenant_id = $2 AND tp.patient_id = $3
       AND tpi.status IN ('PLANNED', 'IN_PROGRESS')`,
    [itemId, tenantId, patientId]
  );
  if (row.rowCount === 0) {
    throw Object.assign(new Error('بند الخطة غير موجود أو مكتمل مسبقاً'), { statusCode: 404 });
  }
  const item = row.rows[0];
  const conditionCode = await resolveTreatmentCondition(client, {
    conditionCode: item.condition_code,
    catalogId: item.catalog_id,
    name: item.name,
  });
  const tooth = normalizeToothFdi(item.tooth_fdi);
  if (tooth && conditionCode && conditionCode !== 'HEALTHY') {
    await setToothCurrent(client, tenantId, patientId, tooth, conditionCode, null);
  }
  await completePlanItem(client, tenantId, patientId, {
    planItemId: item.id,
    tooth,
    conditionCode,
  });
  return loadTreatmentPlan(client, tenantId, patientId);
}

async function applySessionTreatmentsToChart(client, tenantId, patientId, treatments) {
  for (const item of treatments) {
    const planItemId = item.planItemId || item.plan_item_id || null;
    const completeItem = item.completeItem !== false && item.complete_item !== false;

    if (planItemId && !completeItem) {
      await markPlanItemInProgress(client, tenantId, patientId, planItemId);
      continue;
    }

    const tooth = normalizeToothFdi(item.tooth);
    if (!tooth) {
      if (planItemId) {
        await completePlanItem(client, tenantId, patientId, { planItemId });
      }
      continue;
    }

    const conditionCode = await resolveTreatmentCondition(client, item);
    if (conditionCode && conditionCode !== 'HEALTHY') {
      await setToothCurrent(client, tenantId, patientId, tooth, conditionCode, null);
    }
    await completePlanItem(client, tenantId, patientId, {
      planItemId,
      tooth,
      conditionCode,
    });
  }
}

async function loadPlanReport(client, tenantId, patientId) {
  const plan = await loadTreatmentPlan(client, tenantId, patientId);
  const open = (plan.items || []).filter(
    (i) => i.status === 'PLANNED' || i.status === 'IN_PROGRESS'
  );
  const inProgress = (plan.items || []).filter((i) => i.status === 'IN_PROGRESS');
  const completed = (plan.items || []).filter((i) => i.status === 'COMPLETED');

  const sessions = await client.query(
    `SELECT i.tooth, i.name, i.cost, i.plan_item_id, s.created_at
     FROM clinical_session_items i
     JOIN clinical_sessions s ON s.id = i.session_id
     WHERE s.patient_id = $1 AND s.tenant_id = $2
     ORDER BY s.created_at DESC`,
    [patientId, tenantId]
  );

  const openRemaining = open.reduce((sum, i) => sum + Number(i.remainingCost || 0), 0);
  const openTotal = open.reduce((sum, i) => sum + Number(i.cost || 0), 0);
  const completedPlanTotal = completed.reduce((sum, i) => sum + Number(i.cost || 0), 0);
  const executedTotal = sessions.rows.reduce((sum, r) => sum + Number(r.cost || 0), 0);
  const billedOnOpen = open.reduce((sum, i) => sum + Number(i.billedAmount || 0), 0);

  return {
    planId: plan.planId,
    notes: plan.notes,
    planned: open,
    inProgress,
    completed,
    sessions: sessions.rows.map((r) => ({
      tooth: r.tooth,
      name: r.name,
      cost: Number(r.cost),
      planItemId: r.plan_item_id || null,
      date: r.created_at,
    })),
    totals: {
      plannedRemaining: openRemaining,
      plannedOpenTotal: openTotal,
      plannedBilled: billedOnOpen,
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
  updatePlanItemDoctor,
  completePlanItemAndChart,
  applySessionTreatmentsToChart,
  loadPlanReport,
};
