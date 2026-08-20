// backup/paths.js — مجلدات النسخ الاحتياطي
const fs = require('fs');
const path = require('path');

function backupsRoot() {
  const raw = process.env.BACKUPS_DIR;
  if (raw && String(raw).trim()) {
    return path.resolve(String(raw).trim());
  }
  return path.resolve(__dirname, '..', '..', 'backups');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fullBackupDir() {
  return ensureDir(path.join(backupsRoot(), 'full'));
}

function tenantBackupDir() {
  return ensureDir(path.join(backupsRoot(), 'tenants'));
}

function safeBackupFileName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base !== String(name) || base.includes('..')) {
    const err = new Error('اسم ملف النسخة غير صالح');
    err.statusCode = 400;
    throw err;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(base)) {
    const err = new Error('اسم ملف النسخة غير صالح');
    err.statusCode = 400;
    throw err;
  }
  return base;
}

module.exports = {
  backupsRoot,
  ensureDir,
  fullBackupDir,
  tenantBackupDir,
  safeBackupFileName,
};
