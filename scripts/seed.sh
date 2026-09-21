#!/bin/bash
# Seeds the remote Supabase project from supabase/seed.sql.
#
# supabase/seed.sql is the single source of truth. Rather than maintain a
# second copy of the data in TypeScript, this applies the real SQL to a
# throwaway local Postgres, lets Postgres parse its own array literals, dumps
# the resulting rows as JSON, and uploads those. Nothing can drift.
#
# Requires: local postgres (initdb/pg_ctl/psql) and .env.local
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
PGDATA="$TMP/pgdata"
trap 'pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

echo "==> staging supabase/seed.sql in a throwaway local postgres"
initdb -D "$PGDATA" -U postgres --auth=trust >/dev/null 2>&1
pg_ctl -D "$PGDATA" -o "-p 54330 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" \
       -l "$TMP/pg.log" start >/dev/null 2>&1
sleep 2
export PGHOST=127.0.0.1 PGPORT=54330 PGUSER=postgres PGDATABASE=seed_stage
createdb seed_stage
psql -v ON_ERROR_STOP=1 -q -f supabase/schema.sql
psql -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

psql -tAc "select json_agg(l) from (select id,name,address,timezone,to_char(opens_at,'HH24:MI') as opens_at,to_char(closes_at,'HH24:MI') as closes_at from location order by name) l" > "$TMP/locations.json"
psql -tAc "select json_agg(a) from (select id,location_id,trade,type,label,aliases,make,model,serial,to_char(installed_on,'YYYY-MM-DD') as installed_on,to_char(warranty_expires_on,'YYYY-MM-DD') as warranty_expires_on,refrigerant_type from asset order by location_id,label) a" > "$TMP/assets.json"

echo "==> uploading to Supabase"
node --env-file=.env.local --import tsx scripts/push-seed.ts "$TMP/locations.json" "$TMP/assets.json"
