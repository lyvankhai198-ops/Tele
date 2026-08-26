---
name: Daily campaign quota policy
description: Confirmed product behavior when a campaign exhausts its own daily message allowance.
---

Each campaign has its own daily message allowance from the user's plan. When it reaches that allowance, pause that campaign, retain its remaining deliveries, and automatically resume it after the next local-day reset.

**Why:** The limit controls each campaign independently; one campaign must not consume another campaign's allowance. The user wants a hard daily stop but no manual restart step.

**How to apply:** Count sent and in-flight reservations by campaign, preserve the full delivery target, and show the automatic pause/resume reason in campaign details and activity history. PLUS and its one-day trial use 300 messages per campaign per day; PRO uses 600.