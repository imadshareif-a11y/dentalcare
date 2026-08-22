export function dedupeById(rows, idKey = 'id') {
  const seen = new Map();
  for (const row of rows) {
    const id = row?.[idKey];
    if (id == null || seen.has(id)) continue;
    seen.set(id, row);
  }
  return [...seen.values()];
}

export function dedupeByCode(rows, codeKey = 'code', idKey = 'id') {
  const byId = dedupeById(rows, idKey);
  const seen = new Map();
  for (const row of byId) {
    const code = String(row?.[codeKey] ?? row?.account_code ?? '').trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.set(code, row);
  }
  return [...seen.values()];
}

export function dedupeChartAccounts(rows) {
  return dedupeByCode(rows, 'account_code', 'id');
}
