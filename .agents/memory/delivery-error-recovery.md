---
name: Delivery error recovery
description: User-approved policy for Telegram campaign recovery after delivery failures.
---

Only refresh the selected Saved Messages source after an invalid Forward message ID. Do not automatically sync or retry a Telegram account that is banned/revoked or a destination where posting is restricted.

**Why:** A source message can become stale when the user replaces it in Saved Messages, but syncing does not restore an account ban or posting permission and would conceal the real issue.

**How to apply:** Keep recovery to one source refresh and one immediate Forward retry only when the original message still resolves. Otherwise show a language-specific explanation that tells the user whether they must select a new source message, restore account access, or restore group posting permission.