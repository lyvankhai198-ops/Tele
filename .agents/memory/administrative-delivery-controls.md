---
name: Administrative delivery controls
description: Safety rule for support operations that can restart a customer campaign.
---

Any admin action that can make a customer campaign eligible to send must lock the
campaign, re-check its account/template/destination readiness, and commit its
delivery-state transition in the same transaction. A failed-target retry may
only restart a terminal campaign after that same check.

**Why:** A customer can edit a paused campaign or a delivery prerequisite between
an administrator's initial view and the action. Separating validation, schedule
rebasing, and queueing can start an unvalidated configuration or leave a partial
schedule change after reporting a conflict.

**How to apply:** Keep user-scoped ownership predicates on all admin mutations.
For pause/resume/retry features, reuse the same session, forward-source,
destination-permission, quota, and `requires_review` protections that govern
ordinary delivery flows; do not treat an admin role as a bypass for send safety.