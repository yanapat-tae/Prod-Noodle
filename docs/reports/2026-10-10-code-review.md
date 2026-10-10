# Staff state/audio review · 10 October 2026

Reviewed the deployed source at `25e1708` and its recent kitchen, payment-sound and persistent-QR changes. Baseline `pnpm check` passed all 41 Node/PGlite tests. The review then reproduced failures that those tests did not cover.

| Finding | Effect | Correction and regression coverage |
| --- | --- | --- |
| A slow full refresh replaced newer incremental order updates | A served/paid order could return to the kitchen or appear unpaid | Per-login state controller overlays updates received during the read; browser test holds a stale response while a served/paid update arrives |
| A previous login retained an in-flight refresh | Old order data could appear in the next staff session | Dispose the previous controller and ignore its results/errors; browser logout/login regression and queued-refresh unit coverage |
| Realtime order reads could finish out of order | An older preparing snapshot could replace served | Version reads per order, ignore obsolete results/failures and dispose the listener; tests include independent orders, deletion and teardown |
| Every incoming bell appended to the audio queue | Forty notifications delayed a payment cue until 60.02 seconds | Coalesce consecutive pending order bells; the same regression now requires the payment cue within two seconds |
| Late audio resume/failure callbacks survived disable/logout | Sound could reactivate or a new session could be disabled | Guard the audio generation and UI enable request; unit tests cover mute/re-enable and a browser test covers logout/login |
| Current setup docs ran all migrations before seeds | The persistent-QR migration requires seeded tables 1–8 | Document initial two migrations → both seeds → remaining migrations, matching `database-features.test.mjs`; deployed SQL unchanged |

Successful staff mutations now use the returned order immediately before requesting a full refresh. Refresh requests coalesce; a continuous stream of polling requests does not keep an action busy until every later poll finishes. Existing server authorization, retry and money rules are unchanged.

## File organization

Staff ticket, delivery, account and QR components now live in `src/staff/`, alongside QR helpers, sound playback and state synchronization. `src/pages/Staff.tsx` composes the screens. Imports in the demo/Supabase adapter, HTML mock and tests follow the move. Formatting is limited to the staff files and new regressions. The lockfile and dependency declarations are unchanged.

Older dated handoffs are retained in [the history archive](../history/2026-10-handoff.md). Root [HANDOFF](../../HANDOFF.md) now distinguishes current instructions from past release snapshots; [the file map](../project-structure.md) reflects the current source. Browser report output is ignored. No restaurant data or existing local files were cleaned up.

## Verification

- Before correction: all three new audio regressions failed; both stale-state browser regressions failed.
- After correction, before file moves: `pnpm check` passed all 48 Node/PGlite tests, typechecks, lint, build and HTML generation. Focused sound/state browser checks passed, including the additional late-enable/login test.
- After file moves: `pnpm check` passed 48/48 Node/PGlite tests with zero failures/skips, frontend/Edge typechecks, zero-warning lint, production build and regenerated HTML. Full Chromium suite passed 31/31 with two workers and system Chromium. The 390px staff screenshot was inspected; no horizontal overflow was reported by the sound/QR scenarios.
- `git diff --check` and local documentation-link targets pass. No real environment files, local data, dependency/build directories or browser reports are tracked. No migration, Edge, package declaration or lockfile changed.
- Publication: pending.

## Scope and remaining acceptance

Browser tests use controlled API responses and Chromium, including a 390px phone viewport. Audio waveform tests verify distinct cues and unclipped signal; physical iPhone speaker loudness, Safari audio lifecycle, owner login and multi-device Supabase Realtime still require shop acceptance. No live order, payment, QR rotation, seed or migration was executed for this review.

An independent reviewer contributed the fresh-install, audio-enable and Realtime-ordering findings, but did not complete a final sign-off. This report records reproduced regressions and their checks, not a comprehensive security audit. Separate [PR #1](https://github.com/yanapat-tae/Prod-Noodle/pull/1) security/CI work remains unmerged. K PLUS bank-notification speech remains deferred.
