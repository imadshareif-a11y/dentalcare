// tenants/purgeTenant.js — حذف عيادة وكل بياناتها (من لوحة المنصة)

async function runOptional(client, sql, params = []) {
  try {
    await client.query(sql, params);
  } catch (err) {
    if (err.code === '42P01' || err.code === '42703') return;
    throw err;
  }
}

/** يفكّ ارتباطات journal_entries ↔ clinical_sessions ↔ checks */
async function clearTenantDeleteBlockers(client, tenantId) {
  const stmts = [
    `UPDATE clinical_sessions SET journal_entry_id = NULL WHERE tenant_id = $1`,
    `UPDATE idempotency_keys SET journal_entry_id = NULL WHERE tenant_id = $1`,
    `UPDATE checks SET deposited_journal_entry_id = NULL WHERE tenant_id = $1`,
    `UPDATE checks SET cleared_journal_entry_id = NULL WHERE tenant_id = $1`,
    `UPDATE checks SET endorsed_journal_entry_id = NULL WHERE tenant_id = $1`,
    `UPDATE journal_entries SET reversed_by = NULL WHERE tenant_id = $1`,
    `UPDATE fiscal_years SET closed_by = NULL WHERE tenant_id = $1`,
    `UPDATE parties SET account_id = NULL WHERE tenant_id = $1`,
    `UPDATE chart_of_accounts SET party_id = NULL, parent_id = NULL WHERE tenant_id = $1`,
    `UPDATE checks SET holding_account_id = NULL, location_account_id = NULL WHERE tenant_id = $1`,
  ];
  for (const sql of stmts) {
    await runOptional(client, sql, [tenantId]);
  }
}

/**
 * حذف صريح بترتيب آمن — CASCADE وحده يفشل أحيانًا بسبب ترتيب FK
 * (parties ↔ chart_of_accounts, checks ↔ journal_entries, ...).
 */
async function purgeTenant(client, tenantId) {
  await clearTenantDeleteBlockers(client, tenantId);

  await runOptional(client, `
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE tenant_id = $1)
  `, [tenantId]);

  await runOptional(client, `DELETE FROM clinical_session_items WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM clinical_session_images WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM clinical_sessions WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM checks WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM checkbooks WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM journal_entries WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM idempotency_keys WHERE tenant_id = $1`, [tenantId]);

  await runOptional(client, `DELETE FROM cash_boxes WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM bank_accounts WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM banks WHERE tenant_id = $1`, [tenantId]);

  await runOptional(client, `DELETE FROM appointments WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM rooms WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM whatsapp_messages WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM doctors WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM parties WHERE tenant_id = $1`, [tenantId]);
  await runOptional(client, `DELETE FROM chart_of_accounts WHERE tenant_id = $1`, [tenantId]);

  const result = await client.query(
    `DELETE FROM tenants WHERE id = $1 RETURNING id, name, slug`,
    [tenantId]
  );
  return result.rows[0] || null;
}

function mapDeleteError(err) {
  if (err.code === '23503') {
    const detail = err.detail ? `\n${err.detail}` : '';
    return Object.assign(
      new Error(`تعذّر حذف العيادة — بيانات مرتبطة في النظام.${detail}`),
      { statusCode: 409 }
    );
  }
  return err;
}

module.exports = { purgeTenant, clearTenantDeleteBlockers, mapDeleteError, runOptional };
