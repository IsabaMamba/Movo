#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the SQL test suite.
# Requires a reachable Postgres with PostGIS. Defaults match the CI service
# container; override with PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE.
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-movo_test}"
export PGHOST PGPORT PGUSER PGDATABASE

psql_run() { psql -v ON_ERROR_STOP=1 -q "$@"; }

# Globbed, not listed. A hardcoded list silently stops testing every migration
# added after somebody forgets to append to it — which is exactly what happened
# to 0006 and 0007, so CI was green against a schema nobody was running.
# Numeric prefixes make the glob order the apply order.
echo "==> applying migrations to ${PGDATABASE}"
psql_run -f supabase/tests/00_local_shim.sql
for migration in supabase/migrations/*.sql; do
  echo "    ${migration}"
  psql_run -f "${migration}"
done

echo "==> running behavioural + RLS suite"
for suite in supabase/tests/*.sql; do
  case "${suite}" in
    */00_local_shim.sql) continue ;;
  esac
  echo "    ${suite}"
  psql_run -f "${suite}"
done

echo "==> ok"
