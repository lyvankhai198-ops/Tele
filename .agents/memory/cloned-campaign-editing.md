---
name: Cloned campaign editing
description: Preserves clone safety while allowing delivery configuration changes before a Saved Message is chosen.
---

Cloned campaigns keep their assigned admin Telegram account and forward-template placeholder immutable, but their name, destinations, repeat count, delays, and schedule remain editable while draft or paused. A clone can retain unverified copied destinations during editing; it must still pass account and destination readiness checks before it can queue delivery.

**Why:** The copied destination records intentionally start unverified because no user session or posting permission is trusted during cloning. Removing them during an edit would silently erase the clone’s routing, while allowing a send without revalidation would weaken the safety boundary.

**How to apply:** Do not require the client to resubmit immutable clone fields. Keep selected unverified destinations visible when editing a clone, label their state clearly, and keep queue-time preflight as the gate for connected account status and posting permission.