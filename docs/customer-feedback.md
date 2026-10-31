# Customer feedback and discussion

The final shared navigation entry opens `/dashboard/feedback` with Bug, Feature,
Interface and Discussion-group choices. Chat and the old direct support route are
unchanged. Logged-in accounts (including expired subscriptions) can submit.
Impersonated support sessions cannot access or create feedback.

Three feedback categories support 10–4000 characters and one optional screenshot.
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
Sender and exact private chat IDs, bridge state, UUID and allowed statuses are
checked before updates. Notification failure does not discard saved feedback;
admin/customer web views remain authoritative. Customers see their own status,
refreshed every 30 seconds; admins see all recent records and can update them.
The group-link setting is on the same page in its admin-only configuration panel.
No public feedback wall, no AI analysis, and no changes to payment/chat behavior.
