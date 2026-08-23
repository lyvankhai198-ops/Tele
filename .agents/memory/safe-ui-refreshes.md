---
name: Safe UI refreshes
description: The project’s rule for changing TeleCampaign visuals without risking campaign delivery behavior.
---

Visual redesigns should include both public authentication views (login and registration) and the authenticated frontend shell, page presentation, shared components, and localization copy. Do not change campaign API calls, worker behavior, quota rules, proxy transport, or delivery state transitions as part of a visual refresh. The VI/EN switch must remain available and usable at desktop and mobile widths.

**Why:** TeleCampaign’s delivery safety depends on backend invariants that have already been verified, while operators still need a substantially different interface without losing bilingual access.

**How to apply:** Before a visual refresh, create a rollback point; preserve existing data-testids, hooks, mutations, and routes; run typecheck/build; then verify login/register, dashboard, Campaigns, language switching, and mobile navigation in a real browser.