#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_NAME="${DB_NAME:-dentalcare}"
DB_PORT="${DB_PORT:-5432}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
BACKUPS_ROOT="${BACKUPS_DIR:-$ROOT/backups}"
FULL_DIR="$BACKUPS_ROOT/full"
mkdir -p "$FULL_DIR"

STAMP="$(date +%Y%m%d-%H%M)"
OUT="$FULL_DIR/dentalcare-$STAMP.dump"
PG_DUMP_BIN="${PG_DUMP:-pg_dump}"

export PGPASSWORD="$DB_PASSWORD"
"$PG_DUMP_BIN" -Fc -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$OUT"

SIZE="$(wc -c < "$OUT" | tr -d ' ')"
cat > "$FULL_DIR/last-run.json" <<EOF
{"ranAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","file":"$(basename "$OUT")","database":"$DB_NAME","sizeBytes":$SIZE}
EOF
echo "Backup written: $OUT"
