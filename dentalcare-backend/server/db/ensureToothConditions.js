const { pool } = require('./pool');

let ensured = false;

const DEFAULT_CONDITIONS = [
  { code: 'HEALTHY', name: 'سليم', name_en: 'Healthy', name_he: 'תקין', category: 'base', color: '#64748b', sort: 0 },
  { code: 'MISSING', name: 'مفقود', name_en: 'Missing', name_he: 'חסר', category: 'structure', color: '#94a3b8', sort: 10 },
  { code: 'FRACTURE', name: 'كسر', name_en: 'Fracture', name_he: 'שבר', category: 'structure', color: '#dc2626', sort: 20 },
  { code: 'CARIES', name: 'تسوس', name_en: 'Caries', name_he: 'עששת', category: 'disease', color: '#b45309', sort: 30 },
  { code: 'FILLING', name: 'حشوة', name_en: 'Filling', name_he: 'סתימה', category: 'restorative', color: '#0284c7', sort: 40 },
  { code: 'CROWN', name: 'تاج', name_en: 'Crown', name_he: 'כתר', category: 'restorative', color: '#ca8a04', sort: 50 },
  { code: 'VENEER', name: 'فينير', name_en: 'Veneer', name_he: 'ציפוי', category: 'restorative', color: '#eab308', sort: 60 },
  { code: 'BRIDGE', name: 'جسر', name_en: 'Bridge', name_he: 'גשר', category: 'restorative', color: '#d97706', sort: 70 },
  { code: 'ROOT_CANAL', name: 'علاج عصب', name_en: 'Root canal', name_he: 'טיפול שורש', category: 'endo', color: '#7c3aed', sort: 80 },
  { code: 'EXTRACTION', name: 'خلع', name_en: 'Extraction', name_he: 'עקירה', category: 'surg', color: '#64748b', sort: 90 },
  { code: 'IMPLANT', name: 'زراعة', name_en: 'Implant', name_he: 'שתל', category: 'surg', color: '#0d9488', sort: 100 },
];

const ENSURE_SQL = `
CREATE TABLE IF NOT EXISTS tooth_conditions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code         VARCHAR(32) NOT NULL,
    name         VARCHAR(120) NOT NULL,
    name_en      VARCHAR(120),
    name_he      VARCHAR(120),
    category     VARCHAR(32) NOT NULL DEFAULT 'custom',
    color        VARCHAR(16),
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_tooth_conditions_tenant
  ON tooth_conditions(tenant_id, sort_order);
ALTER TABLE tooth_conditions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_tooth_conditions ON tooth_conditions;
CREATE POLICY tenant_isolation_tooth_conditions ON tooth_conditions
  USING (tenant_id = current_setting('app.current_tenant')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant')::UUID);
`;

async function ensureToothConditionsSchema() {
  if (ensured) return;
  await pool.query(ENSURE_SQL);
  ensured = true;
}

async function seedToothConditionsForTenant(client, tenantId) {
  await ensureToothConditionsSchema();
  for (const row of DEFAULT_CONDITIONS) {
    await client.query(
      `INSERT INTO tooth_conditions
         (tenant_id, code, name, name_en, name_he, category, color, sort_order, is_system)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       ON CONFLICT (tenant_id, code) DO NOTHING`,
      [tenantId, row.code, row.name, row.name_en, row.name_he, row.category, row.color, row.sort]
    );
  }
}

async function listToothConditions(client, tenantId, { activeOnly = false } = {}) {
  await seedToothConditionsForTenant(client, tenantId);
  const result = await client.query(
    `SELECT id, code, name, name_en, name_he, category, color, sort_order, is_active, is_system
     FROM tooth_conditions
     WHERE tenant_id = $1
       ${activeOnly ? 'AND is_active = TRUE' : ''}
     ORDER BY sort_order ASC, code ASC`,
    [tenantId]
  );
  return result.rows.map(mapConditionRow);
}

async function assertToothConditionCode(client, tenantId, codeRaw) {
  const code = String(codeRaw || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(code)) return null;
  await seedToothConditionsForTenant(client, tenantId);
  const result = await client.query(
    `SELECT code FROM tooth_conditions
     WHERE tenant_id = $1 AND code = $2 AND is_active = TRUE
     LIMIT 1`,
    [tenantId, code]
  );
  return result.rowCount ? result.rows[0].code : null;
}

function mapConditionRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    name_en: row.name_en || null,
    name_he: row.name_he || null,
    category: row.category,
    color: row.color || null,
    sort_order: row.sort_order,
    is_active: row.is_active !== false,
    is_system: Boolean(row.is_system),
  };
}

async function createToothCondition(client, tenantId, body) {
  await seedToothConditionsForTenant(client, tenantId);
  const name = String(body.name || '').trim();
  if (!name) {
    throw Object.assign(new Error('اسم حالة السن مطلوب'), { statusCode: 400 });
  }
  let code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!code) {
    const fromEn = String(body.name_en || body.nameEn || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    code = fromEn && /^[A-Z]/.test(fromEn)
      ? fromEn.slice(0, 32)
      : `CUSTOM_${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
  }
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(code)) {
    throw Object.assign(new Error('رمز الحالة غير صالح (حروف إنجليزية وأرقام و_)'), { statusCode: 400 });
  }
  const color = body.color ? String(body.color).trim().slice(0, 16) : '#0284c7';
  const sortOrder = Number.isFinite(Number(body.sortOrder))
    ? Number(body.sortOrder)
    : Number(body.sort_order) || 200;
  try {
    const result = await client.query(
      `INSERT INTO tooth_conditions
         (tenant_id, code, name, name_en, name_he, category, color, sort_order, is_system)
       VALUES ($1, $2, $3, $4, $5, 'custom', $6, $7, FALSE)
       RETURNING id, code, name, name_en, name_he, category, color, sort_order, is_active, is_system`,
      [
        tenantId,
        code,
        name,
        body.name_en || body.nameEn || null,
        body.name_he || body.nameHe || null,
        color,
        sortOrder,
      ]
    );
    return mapConditionRow(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('رمز حالة السن مستخدم مسبقاً'), { statusCode: 409 });
    }
    throw err;
  }
}

async function updateToothCondition(client, tenantId, id, body) {
  await seedToothConditionsForTenant(client, tenantId);
  const existing = await client.query(
    `SELECT id, is_system FROM tooth_conditions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (existing.rowCount === 0) {
    throw Object.assign(new Error('حالة السن غير موجودة'), { statusCode: 404 });
  }
  const result = await client.query(
    `UPDATE tooth_conditions SET
       name = COALESCE($3, name),
       name_en = CASE WHEN $4::boolean THEN $5 ELSE name_en END,
       name_he = CASE WHEN $6::boolean THEN $7 ELSE name_he END,
       color = COALESCE($8, color),
       sort_order = COALESCE($9, sort_order),
       is_active = COALESCE($10, is_active),
       updated_at = now()
     WHERE id = $1 AND tenant_id = $2
     RETURNING id, code, name, name_en, name_he, category, color, sort_order, is_active, is_system`,
    [
      id,
      tenantId,
      body.name != null ? String(body.name).trim() : null,
      Object.prototype.hasOwnProperty.call(body, 'name_en') || Object.prototype.hasOwnProperty.call(body, 'nameEn'),
      body.name_en ?? body.nameEn ?? null,
      Object.prototype.hasOwnProperty.call(body, 'name_he') || Object.prototype.hasOwnProperty.call(body, 'nameHe'),
      body.name_he ?? body.nameHe ?? null,
      body.color != null ? String(body.color).trim().slice(0, 16) : null,
      body.sortOrder != null || body.sort_order != null
        ? Number(body.sortOrder ?? body.sort_order)
        : null,
      typeof body.isActive === 'boolean'
        ? body.isActive
        : (typeof body.is_active === 'boolean' ? body.is_active : null),
    ]
  );
  return mapConditionRow(result.rows[0]);
}

async function deleteToothCondition(client, tenantId, id) {
  await seedToothConditionsForTenant(client, tenantId);
  const existing = await client.query(
    `SELECT id, is_system, code FROM tooth_conditions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (existing.rowCount === 0) {
    throw Object.assign(new Error('حالة السن غير موجودة'), { statusCode: 404 });
  }
  if (existing.rows[0].is_system) {
    throw Object.assign(new Error('لا يمكن حذف الحالات الأساسية — يمكن إلغاء تفعيلها'), { statusCode: 400 });
  }
  await client.query(
    `DELETE FROM tooth_conditions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return { success: true };
}

module.exports = {
  DEFAULT_CONDITIONS,
  ensureToothConditionsSchema,
  seedToothConditionsForTenant,
  listToothConditions,
  assertToothConditionCode,
  createToothCondition,
  updateToothCondition,
  deleteToothCondition,
  mapConditionRow,
};
