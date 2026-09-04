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

echo "==> applying migrations to ${PGDATABASE}"
psql_run \
  -f supabase/tests/00_local_shim.sql \
  -f supabase/migrations/0001_schema.sql \
  -f supabase/migrations/0002_functions.sql \
  -f supabase/migrations/0003_rls.sql \
  -f supabase/migrations/0004_seed_categories.sql

echo "==> running behavioural + RLS suite"
psql_run -f supabase/tests/01_participation_test.sql

echo "==> ok"
