# Admin Telegram key lookup

The private, configured admin bot menu includes **🔎 Tìm key**.
Select it, then send one complete license key. Alternatively use `/findkey <key>`.
`/cancel`, another menu action, or five minutes of inactivity ends the input flow.
A support reply to another message, photo or contact is not consumed as a key.

Results distinguish missing, unclaimed, reserved, activated and revoked keys.
They include the key's internal ID, plan, duration, creation/activation dates and
the claimant's TeleCamp username, user ID and registration date when available.
The current account plan and subscription expiry are labelled separately:
renewal or upgrade after redemption does not change that key's historical claim.
An activated/revoked key remains historically activated; missing user records or
inconsistent claim metadata are reported explicitly.

Lookup is an exact SHA-256 search using the same normalization as redemption.
It is read-only and requires both private chat and sender IDs to match the
configured admin. Responses omit the submitted key, encrypted key, password hash,
sessions and phone data. No user input or query exception is logged by the new
lookup handler. There is no schema change.

Offline verification (synthetic fixtures only):

```sh
node --experimental-vm-modules --test scripts/tests/telegram-license-lookup.test.mjs
```
