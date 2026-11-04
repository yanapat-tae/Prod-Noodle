#!/usr/bin/env bash
# Weekly backup of the shop database: dump -> pack -> encrypt.
# Needs: SUPABASE_DB_URL (Session pooler connection string) and BACKUP_PASSPHRASE.
# Usage: backup.sh <output-folder>   Prints the path of the encrypted file.
set -euo pipefail
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL}" "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
out_dir=${1:?Usage: backup.sh <output-folder>}
stamp=$(date -u +%Y-%m-%dT%H%MZ)
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
mkdir -p "$work/prod-noodle-$stamp" "$out_dir"
pack="$work/prod-noodle-$stamp"

# Exact row count of every public table (no customer data, only numbers).
count_rows() {
  psql "$SUPABASE_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c "
    select format('select %L, count(*) from public.%I;', c.relname, c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1" |
  psql "$SUPABASE_DB_URL" -X -A -t -F $'\t' -v ON_ERROR_STOP=1
}

count_rows > "$pack/counts-before.tsv"
# 1) Shop data and structure (menu, orders, payments, QR, staff profiles ...).
pg_dump "$SUPABASE_DB_URL" --format=custom --schema=public --no-owner --no-privileges \
  --file="$pack/public.dump"
# 2) Staff login accounts (needed because staff profiles point to them).
pg_dump "$SUPABASE_DB_URL" --format=custom --data-only \
  --table=auth.users --table=auth.identities --file="$pack/auth-accounts.dump"
count_rows > "$pack/counts-after.tsv"

{
  echo "created_utc=$stamp"
  echo "pg_dump=$(pg_dump --version)"
  echo "server=$(psql "$SUPABASE_DB_URL" -X -A -t -c 'show server_version')"
} > "$pack/manifest.txt"

file="$out_dir/prod-noodle-$stamp.tar.gpg"
tar -C "$work" -cf - "prod-noodle-$stamp" |
  gpg --batch --yes --quiet --pinentry-mode loopback --symmetric --cipher-algo AES256 \
      --passphrase-fd 3 --output "$file" 3<<<"$BACKUP_PASSPHRASE"
echo "$file"
