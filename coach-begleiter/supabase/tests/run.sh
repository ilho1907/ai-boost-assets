#!/usr/bin/env bash
# Faehrt eine lokale PostgreSQL-16-Instanz hoch, spielt zuerst ALLE
# coach-studio-Migrationen ein (Coach-Begleiter setzt coach_profile und
# ist_zugelassene_coachin() voraus — beide teilen sich dieselbe Supabase-
# Datenbank), dann die eigenen Migrationen, dann die Verifikationssuite.
#
#   ./supabase/tests/run.sh
#
# Voraussetzung: PostgreSQL 16 lokal installiert.

set -euo pipefail

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WURZEL="$(cd "$HIER/../.." && pwd)"
COACH_STUDIO_MIGRATIONEN="$WURZEL/../coach-studio/supabase/migrations"

if [ ! -d "$COACH_STUDIO_MIGRATIONEN" ]; then
  echo "Fehler: $COACH_STUDIO_MIGRATIONEN nicht gefunden." >&2
  echo "Coach-Begleiter setzt die coach-studio-Migrationen voraus (dieselbe Supabase-DB)." >&2
  exit 1
fi

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
ARBEIT="${ARBEIT:-$(mktemp -d)}"
PGDATA="$ARBEIT/pgdata"
SOCK="$ARBEIT/sock"
PORT="${PORT:-55440}"

aufraeumen() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
}
trap aufraeumen EXIT

mkdir -p "$PGDATA" "$SOCK"
"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$ARBEIT/pg.log" -o "-p $PORT -k $SOCK" start >/dev/null
sleep 1

export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres

echo "→ Supabase-Stub (auth-Schema, auth.uid, auth.jwt, Rollen)"
psql -q -v ON_ERROR_STOP=1 -f "$HIER/supabase_stub.sql"

echo "→ coach-studio-Migrationen (Abhaengigkeit: coach_profile, ist_zugelassene_coachin)"
for datei in "$COACH_STUDIO_MIGRATIONEN"/*.sql; do
  echo "  · $(basename "$datei")"
  psql -q -v ON_ERROR_STOP=1 -f "$datei" 2>&1 | grep -v NOTICE || true
done

echo "→ coach-begleiter-Migrationen"
for datei in "$WURZEL"/supabase/migrations/*.sql; do
  echo "  · $(basename "$datei")"
  psql -q -v ON_ERROR_STOP=1 -f "$datei" 2>&1 | grep -v NOTICE || true
done

echo "→ Verifikationssuite"
psql -q -v ON_ERROR_STOP=1 -f "$HIER/coach_begleiter_test.sql" 2>&1 | grep -v "^ *set_config\|^-\+$\|^ *[0-9a-f-]\{36\}$\|^(1 row)$\|^ *$" || true
