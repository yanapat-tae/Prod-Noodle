# Project continuation

Read README.md and HANDOFF.md before editing. This is a low-cost Thai restaurant QR/POS pilot deployed on Cloudflare Pages and Supabase. Preserve the React/Vite, Node demo and Supabase architecture unless fixing a blocking defect requires a change.

- Keep large Thai text, >=56px customer controls and emoji food placeholders. Voice/AI, photos and direct delivery integrations are deferred. Start a major phase only when requested.
- Use Node 24/pnpm 11.25.0 and `pnpm install --frozen-lockfile`. Run `pnpm check` before handoff. For narrow edits run relevant checks.
- Edit src/ UI and preview/ mock behavior; regenerate `preview.html` with `pnpm preview:html`, never edit the bundle directly.
- Keep integer-satang prices, server validation, historical snapshots and idempotency. Never acknowledge an unsent/offline order as successful.
- Never expose service-role keys through VITE_. Ignore real .env files, tokens, sales data, node_modules, build output and package stores. Track SQL migrations/seeds, lockfile, icons and preview.html.
- Add new migrations for deployed changes. PGlite/source checks do not prove real Supabase/Deno behavior or free-tier capacity.
- Local demo is localhost-only with mock credentials. Service signup, paid plans, deployment and real-data load tests are separate tasks.

## Security review

- Read docs/security.md for app/API/dependency/deployment work. Use webapp-security-review when available and follow the repository workflow when personal skills are absent.
- Work on branches with synthetic local/staging data. Confirm backend isolation; a Pages preview using the production Supabase project is not staging.
- Run the three security CI checks before release; retest affected auth/permissions/input boundaries after fixes. Preserve failures and report NOT TESTED for unavailable tooling.
- Never directly deploy production, rotate live QR/tokens, rewrite history or mutate live data as part of a security scan. Prepare the reviewed change, test evidence and rollback first.
