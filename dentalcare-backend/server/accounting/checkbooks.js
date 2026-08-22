// accounting/checkbooks.js — دفاتر الشيكات والأرقام التسلسلية

function normalizeSerial(value) {
  return String(value ?? '').trim();
}

function isNumericSerial(value) {
  return /^\d+$/.test(normalizeSerial(value));
}

function compareSerials(a, b) {
  const sa = normalizeSerial(a);
  const sb = normalizeSerial(b);
  if (isNumericSerial(sa) && isNumericSerial(sb)) {
    const diff = BigInt(sa) - BigInt(sb);
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  }
  return sa.localeCompare(sb);
}

function serialInRange(serial, from, to) {
  return compareSerials(serial, from) >= 0 && compareSerials(serial, to) <= 0;
}

function formatNextSerial(current, templateFrom) {
  if (!isNumericSerial(current)) return null;
  const next = (BigInt(current) + 1n).toString();
  const from = normalizeSerial(templateFrom);
  if (isNumericSerial(from) && from.length > next.length) {
    return next.padStart(from.length, '0');
  }
  return next;
}

function countRemaining(nextSerial, serialTo) {
  if (!isNumericSerial(nextSerial) || !isNumericSerial(serialTo)) return null;
  const remaining = BigInt(serialTo) - BigInt(nextSerial) + 1n;
  return remaining > 0n ? Number(remaining) : 0;
}

function mapCheckbook(row) {
  if (!row) return null;
  return {
    id: row.id,
    bank_account_id: row.bank_account_id,
    serial_from: row.serial_from,
    serial_to: row.serial_to,
    next_serial: row.next_serial,
    remaining: countRemaining(row.next_serial, row.serial_to),
    is_active: row.is_active,
    issued_at: row.issued_at,
    created_at: row.created_at,
  };
}

function checkbookHasAvailableSerial(book) {
  if (!book || !book.is_active) return false;
  return compareSerials(book.next_serial, book.serial_to) <= 0;
}

async function loadCheckbook(client, checkbookId, bankAccountId) {
  const result = await client.query(
    `SELECT cb.*, b.bank_number, b.name AS bank_name
     FROM checkbooks cb
     JOIN bank_accounts ba ON ba.id = cb.bank_account_id
     LEFT JOIN banks b ON b.id = ba.bank_id
     WHERE cb.id = $1 AND cb.bank_account_id = $2`,
    [checkbookId, bankAccountId]
  );
  return result.rows[0] || null;
}

async function findAvailableCheckbook(client, bankAccountId, checkbookId = null) {
  if (checkbookId) {
    const book = await loadCheckbook(client, checkbookId, bankAccountId);
    return checkbookHasAvailableSerial(book) ? book : null;
  }
  const result = await client.query(
    `SELECT cb.*, b.bank_number, b.name AS bank_name
     FROM checkbooks cb
     JOIN bank_accounts ba ON ba.id = cb.bank_account_id
     LEFT JOIN banks b ON b.id = ba.bank_id
     WHERE cb.bank_account_id = $1
       AND cb.is_active = TRUE
     ORDER BY cb.issued_at ASC, cb.created_at ASC`,
    [bankAccountId]
  );
  return result.rows.find((row) => checkbookHasAvailableSerial(row)) || null;
}

async function assertCheckNumberAvailable(client, tenantId, bankAccountId, bankNumber, checkNumber) {
  const params = [tenantId, checkNumber, bankAccountId];
  let sql = `
    SELECT id FROM checks
    WHERE tenant_id = $1
      AND check_type = 'ISSUED'
      AND check_number = $2
      AND bank_account_id = $3
    LIMIT 1`;
  const byAccount = await client.query(sql, params);
  if (byAccount.rowCount > 0) {
    throw Object.assign(new Error('رقم الشيك مستخدم مسبقًا في هذا الحساب'), { statusCode: 409 });
  }
  if (bankNumber) {
    const byBank = await client.query(
      `SELECT id FROM checks
       WHERE tenant_id = $1
         AND check_type = 'ISSUED'
         AND check_number = $2
         AND bank_number = $3
         AND bank_account_id IS NULL
       LIMIT 1`,
      [tenantId, checkNumber, bankNumber]
    );
    if (byBank.rowCount > 0) {
      throw Object.assign(new Error('رقم الشيك مستخدم مسبقًا'), { statusCode: 409 });
    }
  }
}

async function validateCheckbookIssue(client, tenantId, { bankAccountId, checkbookId, checkNumber }) {
  const serial = normalizeSerial(checkNumber);
  if (!serial) {
    throw Object.assign(new Error('رقم الشيك مطلوب'), { statusCode: 400 });
  }
  if (!bankAccountId) {
    throw Object.assign(new Error('يجب تحديد حساب البنك المُصدر'), { statusCode: 400 });
  }

  const book = await findAvailableCheckbook(client, bankAccountId, checkbookId || null);
  if (!book) {
    throw Object.assign(new Error('لا يوجد دفتر شيكات فعّال لهذا الحساب'), { statusCode: 400 });
  }
  if (!serialInRange(serial, book.serial_from, book.serial_to)) {
    throw Object.assign(new Error('رقم الشيك خارج نطاق دفتر الشيكات'), { statusCode: 400 });
  }

  await assertCheckNumberAvailable(
    client,
    tenantId,
    bankAccountId,
    book.bank_number,
    serial
  );

  return { checkbook: book, checkNumber: serial };
}

async function advanceCheckbookAfterIssue(client, checkbookId, usedSerial, serialFrom, serialTo) {
  const next = formatNextSerial(usedSerial, serialFrom);
  const stillActive = next ? compareSerials(next, serialTo) <= 0 : false;
  await client.query(
    `UPDATE checkbooks
     SET next_serial = $2,
         is_active = $3
     WHERE id = $1`,
    [checkbookId, next || usedSerial, stillActive]
  );
}

module.exports = {
  normalizeSerial,
  isNumericSerial,
  compareSerials,
  serialInRange,
  formatNextSerial,
  countRemaining,
  mapCheckbook,
  checkbookHasAvailableSerial,
  findAvailableCheckbook,
  validateCheckbookIssue,
  advanceCheckbookAfterIssue,
};
