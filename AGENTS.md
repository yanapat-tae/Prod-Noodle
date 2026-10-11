# Project continuation

Read README.md and HANDOFF.md before editing. This is a low-cost Thai restaurant QR/POS pilot deployed on Cloudflare Pages and Supabase. Preserve the React/Vite, Node demo and Supabase architecture unless fixing a blocking defect requires a change.

- Keep large Thai text, >=56px customer controls and emoji food placeholders. Voice/AI, photos and direct delivery integrations are deferred. Start a major phase only when requested.
- Use Node 24/pnpm 11.25.0 and `pnpm install --frozen-lockfile`. Run `pnpm check` before handoff. For narrow edits run relevant checks.
- Edit src/ UI and preview/ mock behavior; regenerate `preview.html` with `pnpm preview:html`, never edit the bundle directly.
- Keep integer-satang prices, server validation, historical snapshots and idempotency. Never acknowledge an unsent/offline order as successful.
- Never expose service-role keys through VITE_. Ignore real .env files, tokens, sales data, node_modules, build output and package stores. Track SQL migrations/seeds, lockfile, icons and preview.html.
- Add new migrations for deployed changes. PGlite/source checks do not prove real Supabase/Deno behavior or free-tier capacity.
- Local demo is localhost-only with mock credentials. Service signup, paid plans, deployment and real-data load tests are separate tasks.

## Session progress and continuation

- At the start of coding work, read `TASK_PROGRESS.md` and applicable project instructions; inspect current branch/HEAD, `git status --short --branch` and staged/unstaged diff summaries. Read only relevant diffs/files. Reconcile the checkpoint with current files and the latest user request before resuming.
- Create a missing root `TASK_PROGRESS.md` from observed facts before substantial edits. Preserve all existing changes. Resume only unfinished authorized work; do not restart implementation, reset/clean/stash/force-checkout, repeat completed cleanup, or automatically revive deferred tasks.
- Update the checkpoint after meaningful milestones, important test results, blockers/scope changes, and before handing off or stopping. Keep it concise (about 60 lines where practical): objective; timestamp/timezone; branch/HEAD; relevant paths; done/current/remaining steps; checks with command, result, environment and evidence revision; blockers; one exact next action. Link existing plans/reports instead of duplicating logs. Mark old results historical and unrun checks NOT RUN. Exclude secrets and real customer/sales data.
- Run targeted checks first, then required project checks. Repeat checks only after relevant edits, failures or unresolved concerns. Preserve iPhone/security acceptance requirements; distinguish mocks, simulated phones and real devices. Never claim completion without evidence.
- Include progress with the next authorized commit/PR, staging only intended files. A local progress file does not preserve uncommitted code across environments: report what is local versus pushed. No checkpoint grants permission for production writes, deployment, merging, QR rotation or migrations.
- Continue routine authorized work without repeated confirmation. At handoff, summarize verified work and remaining blockers with **ChatGPT did** and **Your next action**. This workflow runs during active sessions; usage limits may interrupt it and a final checkpoint is not guaranteed.
