---
name: Telegram account verification
description: Distinguishes encrypted saved Telegram account details from an authenticated MTProto session.
---

Saving an `api_id`, `api_hash`, phone number, and daily limit creates only an account configuration. It must not imply that the Telegram account is authenticated, because Telegram requires a separate user-verification step to establish an MTProto session.

**Why:** The account form intentionally excludes QR, OTP, 2FA, and session-string fields. A separate phone-login flow establishes the MTProto session; without it, there is no session to use for destination sync or campaign sending.

**How to apply:** Keep secrets encrypted at rest and OTP/2FA passwords request-only. Login challenges must be owner-scoped, short-lived, attempt-limited, and exclusively reserved while Telegram is called. Require an authenticated session before any sync or send client is created.