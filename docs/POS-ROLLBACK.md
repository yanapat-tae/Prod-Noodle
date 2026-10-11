# POS rollback and rollout

Changes extend the existing schema. Never reset/seed the hosted project, replay old
migrations, delete receipts, remove ledger allocations, or recreate Auth accounts.

## Before rollout

1. Check current Git status and POS-IMPROVEMENT-PROGRESS.md and hosted migration history.
2. Capture private exports of the affected function definitions, menu sort_order /
   revision / prep_notes, six requested profiles, and financial/table fingerprints.
   Local captures live in ignored `.local-data/pos-improvement/`; no secrets or sales
   exports should be committed. Keep an owner-controlled backup before ending the session.
3. Run the appropriate checks and inspect verified Email/UIDs and hosted history.
   Both POS migrations and the exact-profile operation are already applied for this
   release; do not replay them. Future releases apply only verified unapplied versions.
4. Deploy the public-api and staff-api with existing custom-auth configuration; build
   the frontend using public keys only and deploy to the existing Pages project.
   Existing open tabs must refresh: legacy single-round dine-in payment intentionally
   returns 409 to prevent charging an incomplete bill.
5. Read back historical fingerprints, note, categories, roles and RPC/grants. Smoke test
   read-only endpoints and production assets; no fabricated sales/real transfers.

## If rollout fails

Stop payment processing while the owner investigates; reconcile actual transfers and
ledger entries before accepting another payment. Prefer a forward fix. Transactional
SQL application rolls back on error; do not rerun an already recorded migration.

Retain bill_payments, payment_transactions.bill_payment_id and all populated data.
Do not downgrade payment methods/slot constraints once new rows exist. Original
function definitions can be restored from the private snapshot only after reviewing
compatibility; a frontend rollback alone cannot re-enable the unsafe single-order
bill flow. Restore Edge/frontend together with a compatible payment implementation.

Reverting category order or note requires comparing current revisions with the
post-migration snapshot first. Do not overwrite subsequent legitimate owner edits.
Reverting profiles affects only the six requested UIDs, preserving everyone else;
review with the owner before removing any newly granted access. Keep references needed
by receipts. Never delete Auth users or force-push Git history.
