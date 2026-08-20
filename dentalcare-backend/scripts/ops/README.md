# Ops backups — نسخ احتياطي كامل لقاعدة PostgreSQL

## المتطلبات
- `pg_dump` و `pg_restore` في PATH (أو عيّن `PG_DUMP` / `PG_RESTORE`)
- ملف `.env` في جذر `dentalcare-backend` مع `DB_*`

## نسخة كاملة
```powershell
# Windows
.\scripts\ops\backup-full.ps1
.\scripts\ops\backup-rotate.ps1
```

```bash
# Linux / macOS
./scripts/ops/backup-full.sh
./scripts/ops/backup-rotate.sh
```

المخرجات تحت `BACKUPS_DIR` (افتراضي `./backups/full/`).

## استعادة (تجريبي فقط أولًا)
```bash
pg_restore --clean --if-exists -d dentalcare backups/full/dentalcare-YYYYMMDD-HHMM.dump
```
**تحذير:** لا تستعدِ فوق إنتاج حي دون تجميد/نسخة سابقة موثوقة.

## جدولة
- Windows: Task Scheduler يستدعي `backup-full.ps1` يوميًا ثم `backup-rotate.ps1`
- Linux: cron مثل `0 2 * * * cd /path/to/dentalcare-backend && ./scripts/ops/backup-full.sh && ./scripts/ops/backup-rotate.sh`

## متغيرات البيئة
- `BACKUPS_DIR` — مجلد الجذر للنسخ
- `BACKUP_KEEP_DAYS` — أيام الاحتفاظ (افتراضي 14)
- `PG_DUMP` / `PG_RESTORE` — مسار الأدوات إن لزم
