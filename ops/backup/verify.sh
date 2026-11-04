#!/usr/bin/env bash
# Proves a backup can really be restored: decrypt -> restore into an EMPTY
# throwaway database -> compare the row counts with the live counts taken
# at backup time. Never point VERIFY_DB_URL at the real shop database.
# Usage: verify.sh <file.tar.gpg>   Needs BACKUP_PASSPHRASE and VERIFY_DB_URL.
set -euo pipefail
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}" "${VERIFY_DB_URL:?Set VERIFY_DB_URL}"
file=${1:?Usage: verify.sh <file.tar.gpg>}
case "$VERIFY_DB_URL" in
  *@127.0.0.1[:/]*|*@localhost[:/]*) ;;
  *) echo "VERIFY_DB_URL must be a local throwaway database" >&2; exit 2 ;;
esac
sql() { psql "$VERIFY_DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 "$@"; }
if [ "$(sql -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'")" != 0 ]; then
  echo "Verify database is not empty; refusing to continue" >&2; exit 2
fi

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 "$file" 3<<<"$BACKUP_PASSPHRASE" |
  tar -C "$work" -xf -
pack=$(find "$work" -mindepth 1 -maxdepth 1 -type d)
pg_restore --list "$pack/auth-accounts.dump" > /dev/null   # file is readable

# Minimal stand-ins for the parts Supabase normally provides.
sql <<'SQL'
-- The backup recreates schema public itself; this database was checked empty above.
drop schema public;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL

restore() { pg_restore --dbname="$VERIFY_DB_URL" --no-owner --no-privileges --exit-on-error "$@" "$pack/public.dump"; }
restore --section=pre-data
restore --section=data
sql -c "insert into auth.users(id) select auth_user_id from public.admins on conflict do nothing"
restore --section=post-data

# Restored count must sit between the live counts read just before and after the dump.
failed=0; tables=0
while IFS=$'\t' read -r table before; do
  after=$(awk -F'\t' -v t="$table" '$1==t{print $2}' "$pack/counts-after.tsv")
  got=$(sql -c "select count(*) from public.\"$table\"")
  lo=$(( before < after ? before : after )); hi=$(( before > after ? before : after ))
  tables=$((tables+1))
  if [ "$got" -lt "$lo" ] || [ "$got" -gt "$hi" ]; then
    echo "MISMATCH $table: restored $got, live $before..$after"; failed=1
  fi
done < "$pack/counts-before.tsv"
[ "$tables" -gt 0 ] || { echo "No tables found in backup" >&2; exit 1; }
[ "$failed" = 0 ] || exit 1
echo "VERIFIED: $tables tables restored with matching row counts"
