---
name: Telegram account verification
description: Distinguishes encrypted saved Telegram account details from an authenticated MTProto session.
---

Saving an `api_id`, `api_hash`, phone number, and daily limit creates only an account configuration. It must not imply that the Telegram account is authenticated, because Telegram requires a separate user-verification step to establish an MTProto session.

**Why:** The account form intentionally excludes QR, OTP, 2FA, and session-string fields. A separate phone-login flow establishes the MTProto session; without it, there is no session to use for destination sync or campaign sending.

**How to apply:** Keep secrets encrypted at rest and OTP/2FA passwords request-only. Login challenges must be owner-scoped, short-lived, attempt-limited, and exclusively reserved while Telegram is called. Require an authenticated session before any sync or send client is created.

If Telegram reports that a session has been revoked or unregistered, clear the stored session and Telegram user identity immediately, return the account to an unverified state, and require the owner to complete login again.

**Why:** A revoked MTProto session must never remain labelled as connected; retaining it leads to repeated technical errors and risks attempts to send through an authorization Telegram has invalidated.

**How to apply:** Detect Telegram's session-revocation RPC signals centrally for every MTProto operation, so sync, saved-message imports, and campaign delivery all converge on the same reauthentication path.