/** إزالة صفوف مكررة من قوائم API (نفس id أو نفس account_code) */
function dedupeById(rows, idKey = 'id') {
  const seen = new Map();
  for (const row of rows) {
    const id = row[idKey];
    if (id == null || seen.has(id)) continue;
    seen.set(id, row);
  }
  return [...seen.values()];
}

function dedupeChartRows(rows) {
  const byId = dedupeById(rows, 'id');
  const byCode = new Map();
  for (const row of byId) {
    const code = String(row.account_code || '').trim();
    if (!code || byCode.has(code)) continue;
    byCode.set(code, row);
  }
  return [...byCode.values()];
}

module.exports = { dedupeById, dedupeChartRows };
