# Customer feedback and discussion

The final shared navigation entry opens `/dashboard/feedback` with Feature proposal
and Discussion-group choices. Bug and Interface choices are removed for new submissions
(also rejected by the API); historical feedback stays readable. Chat and the old direct support route are
unchanged. Logged-in accounts (including expired subscriptions) can submit.
Impersonated support sessions cannot access or create feedback.

Feature proposals support 10–4000 characters and one optional screenshot.
Username/ownership are server-assigned. Optional source metadata stores pathname
only, never query strings. The client compresses PNG/JPEG/WebP up to 4 MiB to a
small payload; the server verifies raster signatures, caps decoded pixels, re-encodes
WebP (stripping metadata), and stores private mode-0600 images under the persistent
media directory. Image routes require the owner or an admin. SVG/active formats,
oversized payloads and other owners' feedback are rejected.

Rate limits are durable, row-lock serialized: one submission per minute, five in a
rolling 24-hour window. Namespaced `system_settings` JSON records avoid migrations.
Lists are bounded to 100 records. Admin status/group-link writes are authorized,
origin-checked and audited. The only group URL is the administrator's configured
HTTPS link; an empty setting shows a disabled “no group link yet” card.

Private-admin Telegram notifications contain a bounded excerpt and status buttons.
Attachments are sent as actual multipart JPEG photos, not public image links.
Stored images remain private. If Telegram rejects a photo, a text fallback retains
the admin controls and access through the protected web page; the saved image is not lost.
Sender and exact private chat IDs, bridge state, UUID and allowed statuses are
checked before updates. Notification failure does not discard saved feedback;
admin/customer web views remain authoritative. Customers see their own status,
refreshed every 30 seconds; admins see all recent records and can update them.
The group-link setting is on the same page in its admin-only configuration panel.
Completing feedback on the web or via Telegram creates a persistent owner-only
website bell notification in the same database transaction. Title/body are VI/EN,
with a link back to the proposal. A stable event key and existing per-user read records
prevent duplicate alerts/read resets on retries or reopening and re-completing.
The bell uses its existing refresh/on-open behavior; offline customers see the alert
on their next login. No new notification channel or customer Telegram opt-in is assumed.
No public feedback wall, no AI analysis, and no changes to payment/chat behavior.
