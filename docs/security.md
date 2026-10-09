# Security workflow · Prod-Noodle

## Before editing or releasing

Read AGENTS.md and this document. Apply `webapp-security-review` when it is available; this repository document also supplies the baseline for environments where the personal skill is unavailable. Preserve customer/staff/owner boundaries, server-calculated prices, integer satang, immutable billing snapshots and idempotency.

Use a branch and local synthetic fixtures or a separate Supabase staging project. A preview connected to the restaurant's production Supabase project is not staging. Do not place real customer addresses, phone numbers, sales, passwords or tokens in source/test fixtures/reports. Do not rotate live QR entries or rerun deployed migrations during review.

## Automated checks

`.github/workflows/security.yml` runs on pull requests, main pushes and manual dispatch:

| Check | Purpose |
| --- | --- |
| Secrets (history and worktree) | Gitleaks 8.30.1, checksum-verified official Linux binary; full fetched history and worktree, redacted logs |
| Static security rules | Semgrep 1.180.0, six reviewed local rules and positive/negative rule fixtures; no metrics or registry rules |
| Dependencies and security regressions | Node 24/pnpm 11.25.0, frozen lockfile install, full dependency audit (High/Critical fail the job), typecheck/lint/tests/build/HTML regeneration |

No production credentials are needed. Jobs use read-only repository permissions, pinned action commits and timeouts; errors fail checks. Reports are not published as public artifacts. Gitleaks excludes installed dependency caches only, not source or build bundles. Semgrep fixtures are intentionally unsafe, never executed/bundled, and excluded from normal ESLint; Semgrep tests them separately. Static rules catch selected dangerous constructs, not comprehensive OWASP coverage or all tainted-data flows. Python scanner transitive dependencies are resolved during installation; its direct version is pinned, not a hash-locked Python environment.

To prevent merging failed checks, configure main protection/rulesets to require PRs and all three checks above, disallow bypass where appropriate. Workflow files alone do not enforce merge protection. Review the final diff and checks before merging; Cloudflare may deploy main automatically. No deploy workflow or live schema change is introduced here. Changes to shared Edge source must later be deployed to all three functions after staging validation, not just frontend deployment.

Dependabot configuration proposes npm and GitHub Actions updates weekly after it reaches the default branch. Review updates and rerun checks; never auto-merge security upgrades or force breaking audit fixes.

## Local commands

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm audit --audit-level=high
node --test tests/edge-security.test.mjs tests/security-database.test.mjs
```

Use official Gitleaks for your OS. On Linux x64, install outside the repository with `bash security/install-gitleaks.sh /tmp/prod-security-tools`, then run its `gitleaks git . --redact=100 --log-opts=--all` and `gitleaks dir . --redact=100` commands. For Semgrep, use a separate virtual environment with `semgrep==1.180.0`, then:

```sh
semgrep --test --config security/semgrep.yml security/semgrep-tests/semgrep.ts
semgrep scan --config security/semgrep.yml --metrics off --disable-version-check --error --strict src server supabase/functions scripts preview
```

Set `SEMGREP_SEND_METRICS=off` and `SEMGREP_ENABLE_VERSION_CHECK=0`. Package audits contact the configured package registry; they report known advisories only. Redact findings and avoid printing real credentials. If a scanner/tool/network fails, report NOT TESTED; do not bypass its exit status.

## Staging security and deployment gate

On a separate authorized test project, verify actual Deno/Auth/PostgREST/RLS behavior using synthetic customer A/B, active staff, inactive staff and owner accounts. Test session expiry/close-table invalidation, direct API role/owner denial, customer isolation, malicious/invalid inputs with no partial writes, retry keys, login/logout/recovery, headers and Realtime. Run real-iPhone acceptance for affected flows. Node tests invoke the real shared TypeScript handler with a Deno shim; PGlite emulates database/Auth roles, so neither proves the hosted runtime behavior.

ZAP is not installed or run by this change. Once isolated staging exists, use a pinned official ZAP version for a bounded baseline (spider/passive) scan with logout/destructive routes and third-party hosts excluded. Passive scans cannot prove injection safety. Active scans require safe scoped test data and explicit authorization; never scan the live restaurant by default.

Before a release, record test evidence, remaining risks, reviewed final diff, and restore/rollback plan. For shared Edge code record previous versions of all three functions; roll back frontend/Edge versions together as needed. For any future data/schema migration verify database backup/restore separately. No backup/restore or rollback exercise has been performed by this setup.

See [security-review-2026-10-09.md](security-review-2026-10-09.md) for the initial evidence and gaps.
