---
name: Daily campaign quota policy
description: Confirmed product behavior when a campaign exhausts its own daily message allowance.
---

Each campaign has its own daily message allowance from the user's currently configured plan limits. When it reaches that allowance, pause that campaign, retain its remaining deliveries, and automatically resume it after the next local-day reset. A lower System Settings limit applies to old and active campaigns immediately; historic send counts remain audit data rather than being rewritten.

**Why:** The limit controls each campaign independently; one campaign must not consume another campaign's allowance. Administrators need System Settings to be the sole live source of limits, and users need a hard daily stop without a manual restart step.

**How to apply:** Count sent and in-flight reservations by campaign, preserve the full delivery target, and show the current effective quota plus the automatic pause/resume reason in campaign details and activity history. When settings change, pause campaigns that are now over the lower limit and only resume a quota-paused campaign if both its campaign and user-wide limits have capacity.