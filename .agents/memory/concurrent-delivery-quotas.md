---
name: Concurrent delivery quotas
description: How to preserve daily message limits when campaign processing becomes multi-worker.
---

Daily message quotas must be reserved atomically before a Telegram send whenever more than one campaign worker process may be active.

**Why:** A check-then-send flow is correct for the current single-worker deployment but two workers can both observe the same final remaining slot and exceed the user-facing limit.

**How to apply:** Before adding worker horizontal scaling, introduce a database-backed per-user/per-day quota reservation with safe handling for failed or uncertain deliveries. Keep the existing at-most-once safeguards for targets in `sending` or `requires_review`.