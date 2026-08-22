// tenants/purgeTenant.js — حذف عيادة وكل بياناتها (من لوحة المنصة)

/**
 * يفكّ ارتباطات تمنع PostgreSQL من حذف tenant بـ CASCADE
 * (ترتيب الحذف بين journal_entries ↔ clinical_sessions ↔ checks).
 */
async function clearTenantDeleteBlockers(client, tenantId) {
  const stmts = [
    [`clinical_sessions`, `UPDATE clinical_sessions SET journal_entry_id = NULL WHERE tenant_id = $1`],
    [`idempotency`, `UPDATE idempotency_keys SET journal_entry_id = NULL WHERE tenant_id = $1`],
    [`checks_deposited`, `UPDATE checks SET deposited_journal_entry_id = NULL WHERE tenant_id = $1`],
    [`checks_cleared`, `UPDATE checks SET cleared_journal_entry_id = NULL WHERE tenant_id = $1`],
    [`checks_endorsed`, `UPDATE checks SET endorsed_journal_entry_id = NULL WHERE tenant_id = $1`],
    [`journal_reversed`, `UPDATE journal_entries SET reversed_by = NULL WHERE tenant_id = $1`],
    [`fiscal_closed_by`, `UPDATE fiscal_years SET closed_by = NULL WHERE tenant_id = $1`],
  ];

  for (const [label, sql] of stmts) {
    try {
      await client.query(sql, [tenantId]);
    } catch (err) {
      if (err.code === '42P01') continue; // جدول/عمود غير موجود بعد
      if (err.code === '42703') continue; // عمود ناقص على Railway قديم
      throw err;
    }
  }
}

async function purgeTenant(client, tenantId) {
  await clearTenantDeleteBlockers(client, tenantId);
  const result = await client.query(
    `DELETE FROM tenants WHERE id = $1 RETURNING id, name, slug`,
    [tenantId]
  );
  return result.rows[0] || null;
}

function mapDeleteError(err) {
  if (err.code === '23503') {
    return Object.assign(
      new Error('تعذّر حذف العيادة — ما زالت مرتبطة ببيانات في النظام. تواصل مع الدعم الفني.'),
      { statusCode: 409 }
    );
  }
  return err;
}

module.exports = { purgeTenant, clearTenantDeleteBlockers, mapDeleteError };
