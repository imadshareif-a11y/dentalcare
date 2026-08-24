// scripts/test-tenant-isolation.js
// يتحقق أن قائمة المستندات المرحلة مقيّدة بعيادة الطلب.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const journalSrc = fs.readFileSync(
  path.join(__dirname, '../server/routes/journal.js'),
  'utf8'
);
const listStart = journalSrc.indexOf("router.get('/journal-entries'");
const listEnd = journalSrc.indexOf("router.get('/journal-entries/:id'");
assert.ok(listStart >= 0 && listEnd > listStart, 'journal list route missing');
const listSql = journalSrc.slice(listStart, listEnd);
assert.match(listSql, /je\.tenant_id = \$1/, 'posted documents list must filter je.tenant_id');
assert.doesNotMatch(
  listSql,
  /WHERE je\.source_type = \$1/,
  'posted documents must not list by source_type alone'
);

const engineSrc = fs.readFileSync(
  path.join(__dirname, '../server/accounting/engine.js'),
  'utf8'
);
assert.match(engineSrc, /INSERT INTO journal_entry_lines[\s\S]*tenant_id/, 'journal lines insert tenant_id');

const chartSrc = fs.readFileSync(
  path.join(__dirname, '../server/routes/chartTree.js'),
  'utf8'
);
assert.match(chartSrc, /WHERE a\.tenant_id = \$1/, 'chart tree list must filter tenant_id');

console.log('tenant isolation source checks passed');
