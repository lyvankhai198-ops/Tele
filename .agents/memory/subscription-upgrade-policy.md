---
name: Subscription upgrade policy
description: Entitlement rules for TeleCampaign license activation and Telegram account capacity.
---

License activation is an upward-only tier change: PLUS → PRO → UNLIMITED. A license for the current or a lower tier must be rejected; renewal is a separate future purchase flow, not same-tier redemption. Any unexpired time on the current subscription is retained one-for-one and the redeemed license duration is added after it. Once a timed subscription expires, the effective entitlement is PLUS.

**Why:** The near-expiry action should lead users toward buying a new key, while same-tier redemption remains unavailable until a separate purchase flow is designed; lower-tier activation would silently remove account capacity and create avoidable data-access risk.

**How to apply:** Keep plan-capacity checks server-side at every Telegram account creation path. Reject current-tier and lower-tier claims; accept only strictly higher-tier claims. Implement buying/renewal separately when its purchase policy is approved.

License keys do not have a separate expiry before redemption. Their `durationDays` begins only after a successful activation.

**Why:** A partner-issued key should provide its full purchased duration no matter when the recipient receives it.

**How to apply:** Never reject an available key merely because it was issued long ago; calculate the new subscription expiry from successful activation, retaining eligible active time under the tier policy above.

For manual admin subscription changes, compare against the stored plan even after its expiry. An expired paid plan has PLUS entitlement for user capacity, but it must only be renewed at the same tier or upgraded; it must never be manually moved down to a lower paid tier.

**Why:** Expiry ends access privileges, not the customer’s recorded purchase tier. Treating an expired Unlimited plan as PLUS for the admin downgrade check would let an operator inadvertently renew it as PRO.

**How to apply:** Keep effective plan calculations for runtime limits separate from stored-tier comparisons in administrative renewal and upgrade flows. Admin reporting should make expired users mutually exclusive from active plan buckets.

For the current sales flow, use admin-generated opaque, single-use license keys that users redeem with their username/password; do not make activation depend on email or simulate payment.

**Why:** This keeps manual/partner sales simple while preserving the existing internal authentication model and leaves room to add a real payment provider later.

**How to apply:** Store only key hashes, show the raw key once to the issuer, consume it atomically on redemption, and audit the activation without logging the key itself.