/**
 * حذف طرف (ذمة) مع حسابه في الشجرة، فقط إن لم تكن عليه حركات مالية.
 */
async function deletePartyIfNoMovements(client, { tenantId, partyId, partyType }) {
  const partyResult = await client.query(
    `SELECT id, account_id, name
     FROM parties
     WHERE id = $1 AND tenant_id = $2 AND party_type = $3`,
    [partyId, tenantId, partyType]
  );
  if (partyResult.rowCount === 0) {
    throw Object.assign(new Error('الذمة غير موجودة'), { statusCode: 404 });
  }

  const { account_id: accountId } = partyResult.rows[0];

  if (partyType === 'PATIENT') {
    const deps = await client.query(
      `SELECT 1 FROM parties
       WHERE tenant_id = $1 AND party_type = 'PATIENT' AND billing_party_id = $2
       LIMIT 1`,
      [tenantId, partyId]
    );
    if (deps.rowCount > 0) {
      throw Object.assign(
        new Error('لا يمكن حذف الولي قبل حذف التابعين أو فك ربطهم'),
        { statusCode: 400 }
      );
    }
  }

  if (accountId) {
    const movements = await client.query(
      `SELECT 1 FROM journal_entry_lines
       WHERE account_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [accountId, tenantId]
    );
    if (movements.rowCount > 0) {
      throw Object.assign(
        new Error('لا يمكن حذف الذمة لوجود حركات مالية عليها'),
        { statusCode: 400 }
      );
    }

    const children = await client.query(
      `SELECT 1 FROM chart_of_accounts
       WHERE parent_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [accountId, tenantId]
    );
    if (children.rowCount > 0) {
      throw Object.assign(
        new Error('لا يمكن حذف الذمة لوجود حسابات فرعية مرتبطة بها'),
        { statusCode: 400 }
      );
    }
  }

  if (partyType === 'DOCTOR') {
    await client.query(
      `DELETE FROM doctors WHERE party_id = $1 AND tenant_id = $2`,
      [partyId, tenantId]
    );
  }

  await client.query(
    `DELETE FROM parties WHERE id = $1 AND tenant_id = $2`,
    [partyId, tenantId]
  );

  if (accountId) {
    await client.query(
      `DELETE FROM chart_of_accounts WHERE id = $1 AND tenant_id = $2`,
      [accountId, tenantId]
    );
  }
}

module.exports = { deletePartyIfNoMovements };
