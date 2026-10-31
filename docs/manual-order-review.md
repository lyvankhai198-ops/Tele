# Manual purchase-order review

The admin purchase-order page offers **Xác minh thủ công / Verify manually** and
**Từ chối / Reject** for VND orders in `pending` or `expired`, including orders
created for automatic provider verification.

## Verify

1. Match the actual incoming bank transaction, destination account, exact amount
   and order reference. A customer-provided screenshot alone is not proof.
2. Open **Xác minh thủ công** and review the customer, plan, reference and amount.
3. Check the receipt-confirmation checkbox, then confirm.

The API checks eligibility and the explicit confirmation inside the same order
row lock as settlement. The existing `/admin` authorization guard still applies.
Successful verification records the admin and review time. It activates/renews
the eligible plan, or records `received` with a key/plan-conflict explanation when
fulfillment cannot finish. An automatic retry retains the recorded manual reviewer.
Manual approval of an expired automatic order may use an available matching key;
it may not take another customer's active reservation.

## Reject

Pending or expired orders require a reason of at least three non-whitespace
characters after trimming. Rejection records the reviewing admin and time, does
not activate a plan, and releases only that order's key reservations.

## Boundaries

- USDT pending/expired orders still require on-chain verification; the checkbox
  cannot bypass that rule. They can still be rejected.
- `received` orders retain **Retry fulfillment**, not another payment approval.
- `paid` orders retain **Revoke**.
- Rejected, cancelled or revoked orders are not reopened by this change.
- No schema migration, real order review, payment-provider write or production
  deployment is performed by installing this code.
- A separate confirmation and rollout are needed before changing the live VPS.
  The rollback-safety change is tracked independently.

## Offline regression tests

```bash
node --experimental-vm-modules --test scripts/tests/manual-order-review.test.mjs
```

Node.js 24 is required (the repository's documented runtime). The test harness
executes the real settlement/review module with in-memory Drizzle/DB, logger and
payment dependencies. It checks action policy, receipt confirmation, USDT
restrictions, reason validation, available-key fallback, review metadata and
serialized provider/admin races. It does not replace PostgreSQL concurrency
testing or an authenticated browser check on a staging deployment.
