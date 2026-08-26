---
name: Admin quota exemptions
description: Scope and safety boundaries for administrator-granted daily quota exemptions.
---

An administrator may schedule a user's daily-message-quota exemption independently of the subscription plan. The exemption applies from the selected start date through the selected end date in the system-local timezone, then the normal user daily message limit returns automatically. Campaign daily limits, account limits, campaign counts, plan access, and subscription expiry remain in force.

**Why:** Support needs a bounded exception for a specific user without accidentally granting the broader benefits or access period of the Unlimited plan.

**How to apply:** Keep the setting auditable and admin-only, and calculate the expiry using the system quota timezone. When changing quota behavior, preserve this boundary unless the product requirement explicitly calls for a broader entitlement change.