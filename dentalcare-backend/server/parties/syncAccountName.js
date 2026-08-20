function accountLabels(partyType, name) {
  const trimmed = String(name || '').trim();
  if (partyType === 'PATIENT') {
    return { ar: `ذمة: ${trimmed}`, en: `Balance: ${trimmed}`, he: `יתרת: ${trimmed}` };
  }
  if (partyType === 'SUPPLIER') {
    return { ar: `مورد: ${trimmed}`, en: `Supplier: ${trimmed}`, he: `ספק: ${trimmed}` };
  }
  if (partyType === 'EMPLOYEE') {
    return { ar: `موظف: ${trimmed}`, en: `Employee: ${trimmed}`, he: `עובד: ${trimmed}` };
  }
  return { ar: `ذمة الطبيب: ${trimmed}`, en: `Doctor: ${trimmed}`, he: `רופא: ${trimmed}` };
}

async function syncPartyAccountName(client, accountId, partyType, name) {
  const labels = accountLabels(partyType, name);
  await client.query(
    `UPDATE chart_of_accounts
     SET account_name = $2, account_name_ar = $2, account_name_en = $3, account_name_he = $4
     WHERE id = $1`,
    [accountId, labels.ar, labels.en, labels.he]
  );
}

module.exports = { syncPartyAccountName };
