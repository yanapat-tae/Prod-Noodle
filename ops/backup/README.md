# Weekly database backup (option B)

Every Sunday at 03:17 Bangkok time, a free GitHub robot:

1. copies the whole shop database (menu, orders, payments, QR, staff accounts),
2. locks the copy with your backup password (AES-256 encryption),
3. **test-restores** it into an empty throwaway database and checks that every table
   has the right number of rows,
4. saves the locked file in a **private** GitHub repo, named by date.

If any step fails, GitHub emails you, and nothing broken is saved.

The robot only **reads** the shop database. It never changes it.

## Files

| File | What it does |
|---|---|
| `backup.sh` | Takes the copy and locks it |
| `verify.sh` | Unlocks a copy and proves that it can be restored (only into an empty local database) |
| `github-workflow.yml` | The weekly schedule. It goes into the private repo as `.github/workflows/backup.yml` |
| `test-local.sh` | A rehearsal using fake data built from this repo's migrations. No internet and no real data |

## One-time setup

> Never put the backup files, the database password or the backup password into
> the public Prod-Noodle repo or into a chat.

1. **Create a private repo** on GitHub named `prod-noodle-backup`. Choose *Private*.
2. **Choose a backup password** that is long, for example four random words. Save it in the
   Apple **Passwords** app. Without it, no backup can ever be opened.
3. **Get the database connection string.** In Supabase, open project `prod-noodle-pilot`,
   click **Connect**, and copy the **Session pooler** string. GitHub's robot can't use
   the "Direct connection" string. Replace `[YOUR-PASSWORD]` with the database password.
   If you don't know that password, use *Project Settings → Database → Reset database
   password*. Choose letters and numbers only. The app doesn't use this password, so
   resetting it doesn't affect the shop.
4. **Store two secrets** in the private repo, under *Settings → Secrets and variables →
   Actions → New repository secret*:
   - `SUPABASE_DB_URL` = the string from step 3
   - `BACKUP_PASSPHRASE` = the password from step 2
5. **Add the files** to the private repo (Claude can do this once the repo exists):
   `ops/backup/backup.sh`, `ops/backup/verify.sh`, and
   `.github/workflows/backup.yml` (copied from `github-workflow.yml`).
6. **First run:** in the private repo, open *Actions → Weekly shop database backup →
   Run workflow*. A green tick and a new file under `backups/` mean it works.

## Restore (only in an emergency)

Ask for help first. A restore replaces data, so it needs a careful plan.

The short version for a technical helper:
`gpg --decrypt FILE.tar.gpg | tar -xf -` gives `public.dump` (shop data),
`auth-accounts.dump` (staff logins) and the row counts. Restore into a **new** Supabase
project with `pg_restore --no-owner --no-privileges`, staff logins (`auth-accounts.dump`) first.
Never restore over the live database without a fresh backup and the owner's approval.

## Limits

- Weekly backups mean up to 7 days of orders could be lost. The schedule can be changed
  to daily if needed. It's still free.
- Supabase Storage files are not included. The app has no photos today.
- Each file is small (the local rehearsal file was about 50 KB). The real size is not
  measured yet.
