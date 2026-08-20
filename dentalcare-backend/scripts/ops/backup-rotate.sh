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

KEEP="${BACKUP_KEEP_DAYS:-14}"
BACKUPS_ROOT="${BACKUPS_DIR:-$ROOT/backups}"
FULL_DIR="$BACKUPS_ROOT/full"
[[ -d "$FULL_DIR" ]] || { echo "No full backups dir"; exit 0; }

find "$FULL_DIR" -maxdepth 1 -type f -name 'dentalcare-*.dump' -mtime +"$KEEP" -print -delete
echo "Rotate done (keep $KEEP days)"
