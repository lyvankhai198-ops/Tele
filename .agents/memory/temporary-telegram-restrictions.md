---
name: Temporary Telegram restrictions
description: Scheduling and delivery rules for Telegram groups with a known posting-restriction expiry.
---

A Telegram destination with a known temporary restriction may be selected only when the user explicitly confirms a campaign start at least five minutes after the latest selected restriction expires. Never auto-apply the suggested time. Missing, zero, invalid, or unknown expiry remains unavailable like a permanent restriction.

**Why:** Telegram restriction timing can change, and a suggested expiry is not proof that posting permission has been restored. Automatic scheduling would make an external restriction decision on the user's behalf.

**How to apply:** Use Telegram's live restriction expiry only to calculate a suggestion and enforce the safety boundary. At delivery time, recheck live posting permission; if it is still denied, skip only that destination while other destination queues continue.