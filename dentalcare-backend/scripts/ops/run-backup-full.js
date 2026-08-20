// scripts/ops/run-backup-full.js — يستدعى من npm أو منصة الإدارة
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { fullBackupDir } = require('../../server/backup/paths');

function resolvePgDump() {
  if (process.env.PG_DUMP && String(process.env.PG_DUMP).trim()) {
    return String(process.env.PG_DUMP).trim();
  }

  const candidates = [];
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    for (const ver of ['18', '17', '16', '15', '14', '13']) {
      candidates.push(path.join(pf, 'PostgreSQL', ver, 'bin', 'pg_dump.exe'));
    }
  } else {
    candidates.push('/usr/bin/pg_dump', '/usr/local/bin/pg_dump', '/opt/homebrew/bin/pg_dump');
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'pg_dump';
}

function runFullBackup() {
  const fullDir = fullBackupDir();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-').slice(0, 13);
  const fileName = `dentalcare-${stamp}.dump`;
  const outFile = path.join(fullDir, fileName);

  const pgDump = resolvePgDump();
  const args = [
    '-Fc',
    '-h', process.env.DB_HOST || 'localhost',
    '-p', String(process.env.DB_PORT || 5432),
    '-U', process.env.DB_USER || 'postgres',
    '-d', process.env.DB_NAME || 'dentalcare',
    '-f', outFile,
  ];

  const result = spawnSync(pgDump, args, {
    env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || 'postgres' },
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    const detail = (
      result.error?.message
      || result.stderr
      || result.stdout
      || 'فشل pg_dump'
    ).toString().trim().slice(0, 400);
    const hint = /not recognized|ENOENT|not found/i.test(detail)
      ? ' — ثبّت أدوات PostgreSQL أو عيّن PG_DUMP في .env لمسار pg_dump.exe'
      : '';
    const err = new Error(detail + hint);
    err.statusCode = 500;
    throw err;
  }

  const stat = fs.statSync(outFile);
  const meta = {
    ranAt: new Date().toISOString(),
    file: fileName,
    database: process.env.DB_NAME || 'dentalcare',
    sizeBytes: stat.size,
    pgDump,
  };
  fs.writeFileSync(path.join(fullDir, 'last-run.json'), JSON.stringify(meta, null, 2));
  return meta;
}

if (require.main === module) {
  try {
    const meta = runFullBackup();
    console.log('Backup written:', meta.file, `(${meta.sizeBytes} bytes)`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { runFullBackup, resolvePgDump };
