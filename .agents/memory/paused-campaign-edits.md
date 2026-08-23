---
name: Paused campaign edits
description: The confirmed safety behavior for editing a campaign after it has been paused.
---

When a paused campaign is edited, keep the deliveries already confirmed as sent and rebuild only the not-yet-sent schedule. If it has sent before, begin the new remaining schedule after the latest confirmed send plus the round delay. The campaign remains paused after the edit until the user explicitly resumes it.

**Why:** The user explicitly chose this behavior on August 23, 2026 to avoid deleting/recreating a campaign or accidentally sending earlier deliveries again.

**How to apply:** Do not reset successful deliveries when changing a paused campaign's content, destinations, repeats, or delays. Do not create an immediately due replacement target before its configured round delay has elapsed after a prior send. Block edits until any in-flight delivery reaches a terminal state, then resume only through an explicit user action.