#!/usr/bin/env bash
# Local rehearsal (no internet, no real data): builds a fake shop database from
# the repo migrations, runs backup.sh, then verify.sh into a second database.
# Needs PostgreSQL server binaries (initdb/pg_ctl) on PATH or PG_BIN.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
PATH="${PG_BIN:-/usr/lib/postgresql/16/bin}:$PATH"
tmp=$(mktemp -d); port=55432
cleanup() { pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
initdb -D "$tmp/data" -U postgres -A trust -E UTF8 --no-locale >/dev/null
pg_ctl -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=127.0.0.1" -l "$tmp/log" -w start >/dev/null
base="postgresql://postgres@127.0.0.1:$port"
psql "$base/postgres" -X -q -c 'create database prod_source' -c 'create database prod_verify'
src="$base/prod_source"
run() { psql "$src" -X -q -v ON_ERROR_STOP=1 "$@" >/dev/null; }
run <<'SQL'
create role anon; create role authenticated; create role service_role bypassrls;
create publication supabase_realtime;
create schema auth;
create table auth.users(id uuid primary key, email text);
create table auth.identities(id uuid primary key, user_id uuid references auth.users);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
for f in 202610050001_initial_schema.sql 202610050002_application_api.sql; do run -f "$root/supabase/migrations/$f"; done
run -f "$root/supabase/seed.sql"; run -f "$root/supabase/menu-seed.sql"
for f in $(ls "$root/supabase/migrations" | grep -v -e 202610050001 -e 202610050002 | sort); do run -f "$root/supabase/migrations/$f"; done
run <<'SQL'
insert into auth.users values ('00000000-0000-4000-8000-000000000001','owner@example.test');
insert into auth.identities values ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000001');
insert into public.admins(auth_user_id,account_slot,display_name,role)
  values ('00000000-0000-4000-8000-000000000001',1,'Owner','owner');
SQL
order=$(psql "$src" -X -A -t -v ON_ERROR_STOP=1 -c "select public.place_order(
  '{\"channel\":\"dine_in\",\"tableNumber\":1,\"lines\":[{\"itemCode\":\"water\",\"variantCode\":\"normal\",\"quantity\":2,\"options\":[],\"notes\":[]}],\"expectedTotalSatang\":2000}'::jsonb,
  gen_random_uuid(), repeat('a',64), null, '00000000-0000-4000-8000-000000000001'::uuid)->>'id'")
echo "fake order: $order"

export SUPABASE_DB_URL="$src" BACKUP_PASSPHRASE="local-test-only" VERIFY_DB_URL="$base/prod_verify"
file=$(bash "$here/backup.sh" "$tmp/out")
echo "backup: $(basename "$file") ($(stat -c %s "$file") bytes)"
if tar -tf "$file" >/dev/null 2>&1; then echo "FAIL: backup is not encrypted"; exit 1; fi
if BACKUP_PASSPHRASE=wrong bash "$here/verify.sh" "$file" >/dev/null 2>&1; then echo "FAIL: wrong password accepted"; exit 1; fi
echo "wrong password rejected: OK"
head -c 20000 "$file" > "$tmp/broken.tar.gpg"
if bash "$here/verify.sh" "$tmp/broken.tar.gpg" >/dev/null 2>&1; then echo "FAIL: damaged file accepted"; exit 1; fi
echo "damaged file rejected: OK"
bash "$here/verify.sh" "$file"
[ "$(psql "$VERIFY_DB_URL" -X -A -t -c "select count(*) from public.orders where id='$order'")" = 1 ]
echo "fake order present in restored copy: OK"
