# Task progress — red restaurant icon

- Updated: 2026-10-29 UTC.
- Objective: deploy the user-approved red-background noodle icon with Thai โปรด.
- Authorization: user reviewed the design and explicitly requested “Deploy”.
- Workspace: `/workspace/Prod-Noodle`; branch `chore/red-brand-icon-20261029`.
- Base HEAD / fetched main: `734d44bb6a9b00fa130be8d7a5db8ef35c423d5f`; clean at start.
- Existing app: React/Vite, Cloudflare Pages `prod-noodle.pages.dev`.
- Production before release: `b651293f-8546-42dc-90d4-e9d9f161226e`, successful, base HEAD.
- Scope: static icons, reproducible export, favicon/touch/manifest references and SW cache revision.
- Preserve application theme, all ordering/POS behavior, backend, data, users and QR links.
- Completed: full-bleed master; PNG32/180/192/512; versioned favicon/touch/manifest; new SW cache.
- Checks: frozen install; pnpm check PASS (96/96); production-configured Vite build PASS.
- Browser QA: PASS at 390×844 and 430×932, synthetic menu reads, no overflow/page errors,
  correct decoded sizes, legacy cache removal and offline icons after controlled navigation.
- Independent code review: no material findings; latest mobile screenshots visually passed.
- Evidence/details: `docs/reports/2026-10-29-red-icon.md`; logs/screenshots in `/tmp/prod-icon-*`.
- Current step: commit/push and merge static release, then verify production deployment/bytes.
- Remaining: GitHub release; successful matching Cloudflare deployment; HTTPS asset verification.
- Actual iPhone/Safari installation: NOT TESTED (no physical-device session).
- Rollback: previous successful Cloudflare deployment above; static-only change, no migrations.
- Next action: commit only scoped icon/source/documentation files and push the release branch.
