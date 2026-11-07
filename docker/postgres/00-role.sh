#!/bin/sh
# Creates the non-owner role the API uses, so row level security applies to it.
set -eu
if [ -z "${APP_DB_PASSWORD:-}" ]; then
  echo "APP_DB_PASSWORD is required" >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$APP_DB_PASSWORD" <<'EOF'
SELECT format('CREATE ROLE biory_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'biory_app')
\gexec
ALTER ROLE biory_app SET search_path = public;
EOF
