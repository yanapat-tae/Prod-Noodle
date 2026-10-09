# Security review · 9 October 2026

Base: `cfe5fa269077061956c8ed88d7ab8edd5272c93e` on main. Work: `security/review-and-ci-20261009`. Local Node 24.19.0/pnpm 11.25.0, synthetic tests only. Hosted metadata review: `emjktqzcvgjwtsgysljy`, read-only catalog queries and security advisor. No hosted accounts/orders/QR/schema/secrets changed; no production deployment.

## Six-area results

| Area | Status and evidence | Limit |
| --- | --- | --- |
| Authentication | PASS for local shared staff-guard tests: missing/invalid identity, inactive profile, owner-only denial; Supabase getUser verified in source | Real sign-in/session expiry/logout/recovery and Auth settings NOT TESTED |
| Authorization | PASS for final migration-chain PGlite tests: 22 RLS tables, service-only mutation grants, inactive staff denial/no mutation, customer A/B isolation and close-table invalidation; hosted catalog confirms 22 RLS tables and mutation grants | Hosted authenticated RLS/PostgREST/Realtime abuse tests NOT TESTED |
| Secrets | PASS: Gitleaks 8.30.1 full fetched history (9 base commits) and worktree, redacted; zero source/history findings | Detection is pattern-based; runtime/host secrets not inspected |
| Input validation | PASS: existing order/menu validation and atomic rollback tests, seven new shared-Edge tests; bounded streaming fix verified | Actual Deno/hosted runtime and broader injection fuzzing NOT TESTED |
| Dependencies | PASS: pnpm audit full report: 245 dependencies, zero known advisories, exit 0; high-threshold command also exit 0 | Known advisory coverage only; no claim of all supply-chain threats |
| Security testing | PASS for scoped local checks: pnpm check 36/36, six Semgrep rule tests and source scan, scanner/config validation | GitHub-run execution, ZAP, staging, backup/restore and real iPhone NOT TESTED at initial handoff |

Gitleaks initial broad directory scan also detected eight matches in downloaded package-store contents. File locations were inspected without printing values; the final configuration excludes installed dependency/cache directories only, retains built-in detectors and scans app source/build output. No actual application credential was identified or suppressed. Scanner errors were fixed before obtaining final passing results.

Semgrep 1.180.0: six local rules (dynamic code, raw HTML sinks, shell strings, interpolated SQL, private client env, TLS disabled). Positive/negative fixtures passed 6/6; source scan checked 25 JS/TS files in src/server/supabase/functions/scripts/preview, zero findings/errors, exit 0. This is selected-pattern coverage, not comprehensive OWASP certification, SQL-migration analysis or a dataflow audit. Typecheck/lint and final-migration database tests supplement it.

## Fixes

- **Medium availability risk:** the shared Edge wrapper previously called request.text() before measuring bytes. It could buffer an oversized body before rejecting it. It now reads chunks, stops/cancels above 50,000 bytes, then decodes only accepted bodies. Regression reproduced before the fix and passes afterward; UTF-8 byte limits are independent of declared Content-Length. Upstream platform limits may reduce exploitability; this review did not measure those limits.
- **Low hardening:** Bearer parsing now requires its scheme, accepts case-insensitive Bearer and rejects extra tokens. Previous parsing accepted a bare token. Identity/token validation was already enforced downstream; no authentication bypass is claimed.
- **Low hardening:** routing requires the actual function path boundary, supporting hosted `/functions/v1/name` and local `/name` paths; rejects prefix lookalikes and arbitrary nested prefixes. No authorization bypass is claimed.

These changes are in shared Edge source and are not deployed. Local Node executes it with a Deno shim. Confirm both supported path forms and normal customer/staff flows on isolated staging before deploying all three functions.

## Hosted advisory review

1. [Authenticated SECURITY DEFINER function](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable): `public.is_staff()` is intentionally used by RLS to inspect active admins without recursive policies. Hosted definition was read: no arguments, fixed empty search_path, boolean check tied to auth.uid(). Anonymous EXECUTE is denied; authenticated EXECUTE is intentional. Do not blindly convert to invoker/revoke it, which can break access policies. Moving the helper to a private schema is a future defense-in-depth migration, not required to silence the warning during setup.
2. [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection): hosted advisor reports this disabled. Official docs say the feature requires Pro or above; no plan upgrade or settings change was made. Use unique strong passwords (prefer a password manager), inspect staff provisioning/public-signup/rate-limit/recovery configuration separately and record this residual gap. Password strength/settings were not verified here.

Hosted metadata also confirms all three reporting views use security_invoker=true, and only is_staff/staff_sales_report are callable by authenticated clients among public application functions. Catalog/grant verification is not proof of every runtime authorization path.

## Release gates and next steps

- Review and merge the PR only after its three GitHub checks pass. Workflow syntax and equivalent local commands were checked; remote job status must be checked separately.
- Require all three checks through main branch protection/rulesets. Repository rulesets endpoint returned none; reading classic branch protection returned 403 (integration lacks administration access), so existing classic protection is unknown. Settings were not changed and CI cannot yet be called an enforced merge gate.
- Use separate staging backend/accounts for hosted auth/API/RLS and bounded ZAP checks. No isolated staging project was supplied/created. Never run active scans/load tests against the restaurant's live backend.
- Human-review final diff/evidence and document rollback for frontend plus all three Edge functions before production. No backup/restore or rollback exercise was performed.
- Real iPhone acceptance remains pending. No UI/source styling changes are included; browser regressions were not rerun for this backend/CI-only change.

Decision: local security setup is ready for PR review; production deployment remains pending CI enforcement, isolated staging verification and human review. No 100% safety claim.
