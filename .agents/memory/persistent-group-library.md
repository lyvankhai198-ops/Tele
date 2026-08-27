---
name: Persistent group library
description: Product rule for the admin-only saved Telegram group library.
---

The group library is its own durable, admin-only store of group/forum-root snapshots. An explicit sync imports only target groups from campaigns whose current status is `running`, across all users. A Telegram group ID is saved once; later syncs ignore it rather than creating a duplicate.

**Why:** `destinations` also holds drafts, paused work, and transient routing information, so using it as the library source pollutes the shared collection. Conversely, deleting already-saved groups when a campaign stops loses useful discovery history.

**How to apply:** Do not backfill the library from all destinations, drafts, queued, paused, or completed campaigns. Retain library rows after their source campaign stops. Calculate and display delay ranges dynamically from the running campaigns currently targeting each saved group; omit a delay when none are running. Keep the surface admin-only until product access is expanded deliberately.