---
name: Subscription access policy
description: Trial, expiry, renewal, and entitlement rules for TeleCampaign license activation and workspace access.
---

Every newly registered user begins a one-day PLUS trial. At trial or paid-subscription expiry, the entire workspace must be unavailable, except for the logged-in upgrade/license activation path; delivery workers must pause pending campaigns rather than sending outside the access period.

**Why:** A downgrade to effective PLUS limits after expiry is not sufficient access control: users must not create, change, or send campaign work after their paid access has ended.

**How to apply:** Enforce active subscription status server-side on workspace endpoints, preserve access to upgrade/activation, gate the client route for clear guidance, and check the status again in the background delivery worker.

While a subscription is active, activation is an upward-only tier change: PLUS → PRO → UNLIMITED. A key for the current or a lower tier is rejected. After expiry, an available key for PLUS, PRO, or UNLIMITED may restore access; any unexpired time on the current subscription is retained one-for-one and the redeemed key duration is added after it.

**Why:** An expired trial user must be able to buy the entry-level PLUS plan, while active customers must not silently lower account capacity or consume a same-tier key as a renewal.

**How to apply:** Keep plan-capacity checks server-side at every Telegram account creation path. On an active subscription accept only strictly higher-tier claims; when expired accept all valid plan keys and start the paid duration from redemption.

License keys do not have a separate expiry before redemption. Their `durationDays` begins only after a successful activation.

**Why:** A partner-issued key should provide its full purchased duration no matter when the recipient receives it.

**How to apply:** Never reject an available key merely because it was issued long ago; calculate the new subscription expiry from successful activation, retaining eligible active time under the tier policy above.

For manual admin subscription changes, compare against the stored plan even after its expiry. An expired paid plan has PLUS entitlement for user capacity, but it must only be renewed at the same tier or upgraded; it must never be manually moved down to a lower paid tier.

**Why:** Expiry ends access privileges, not the customer’s recorded purchase tier. Treating an expired Unlimited plan as PLUS for the admin downgrade check would let an operator inadvertently renew it as PRO.

**How to apply:** Keep effective plan calculations for runtime limits separate from stored-tier comparisons in administrative renewal and upgrade flows. Admin reporting should make expired users mutually exclusive from active plan buckets.

For the current sales flow, use admin-generated opaque, single-use license keys that users redeem with their username/password; do not make activation depend on email or simulate payment.

**Why:** This keeps manual/partner sales simple while preserving the existing internal authentication model and leaves room to add a real payment provider later.

**How to apply:** Store only key hashes, show the raw key once to the issuer, consume it atomically on redemption, and audit the activation without logging the key itself.