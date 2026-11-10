#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local Postgres (with a minimal
# Supabase stub) and runs the RLS checks. Needs initdb/pg_ctl on PATH or under
# /usr/lib/postgresql/*/bin.
set -euo pipefail
cd "$(dirname "$0")/.."
BIN=$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-54329}
cleanup() { "$BIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
RUNAS=()
if [ "$(id -u)" = 0 ]; then chown -R postgres "$DIR"; RUNAS=(runuser -u postgres --); fi
"${RUNAS[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${RUNAS[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do echo "apply $f"; "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/rls.test.sql
