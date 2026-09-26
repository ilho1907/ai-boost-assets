#!/usr/bin/env bash
# Faehrt eine lokale PostgreSQL-16-Instanz hoch, spielt alle Migrationen ein und
# laesst die Verifikationssuite laufen. Braucht kein Supabase-Projekt.
#
#   ./supabase/tests/run.sh
#
# Voraussetzung: PostgreSQL 16 lokal installiert (initdb/pg_ctl/psql im Pfad
# oder unter /usr/lib/postgresql/16/bin).

set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WURZEL="$(cd "$HIER/../.." && pwd)"

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
ARBEIT="${ARBEIT:-$(mktemp -d)}"
PGDATA="$ARBEIT/pgdata"
SOCK="$ARBEIT/sock"
PORT="${PORT:-55432}"

aufraeumen() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

mkdir -p "$PGDATA" "$SOCK"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$ARBEIT/pg.log" -o "-p $PORT -k $SOCK" start >/dev/null
sleep 1

export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres

echo "→ Supabase-Stub (auth-Schema, auth.uid, Rollen)"
psql -q -v ON_ERROR_STOP=1 -f "$HIER/supabase_stub.sql"

for datei in "$WURZEL"/supabase/migrations/*.sql; do
  echo "→ Migration $(basename "$datei")"
  psql -q -v ON_ERROR_STOP=1 -f "$datei" 2>&1 | grep -v NOTICE || true
done

echo "→ Verifikationssuite"
psql -q -v ON_ERROR_STOP=1 -f "$HIER/lead_radar_test.sql" 2>&1 | grep -v "^ *set_config\|^-\+$\|^ *[0-9a-f-]\{36\}$\|^(1 row)$\|^ *lead_delete_cascade\|^ *$" || true
