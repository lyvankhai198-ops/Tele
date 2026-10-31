# Announcement popups

Admin route `/admin/popups` provides offer, news and community templates, custom
accent, plain-text VI/EN copy, optional private banner, safe HTTPS/internal CTA,
start/expiry, priority, audience, draft/published and automatic-display switches.
English content falls back to VI when left blank. Preview uses the same responsive
Radix dialog as customer display, including phone/desktop and VI/EN controls.
Preview never claims a customer view; links are inert in preview.

Customer display begins after login, excludes admin/support/password-reset sessions,
and waits for existing dialogs to close. One announcement per entry/reload/login,
not per in-app route change. Default daily frequency uses system timezone;
once-only and every-entry are configurable. Paid/unpaid means currently active
subscription versus no currently active subscription, including expired accounts.
Claims are database-serialized per account, persist across devices, and select the
highest-priority eligible announcement. Only 20 recent visit IDs are retained and
seen records are bounded by the maximum 100 configured announcements.

All new state uses `system_settings` namespaces `popup:item:` and `popup:user:`;
no schema migration, new dependency or AI cost. No announcement is seeded on deploy.
Admin edits use version checks; writes are origin-protected, admin-only and audited.
Customer media access checks publication, time and audience; image responses are
private/no-store. Uploaded rasters are bounded, re-encoded WebP with metadata stripped
and stored mode-0600 outside checkout. Deleting/replacing cleans the old image.

Expiry closes an open dialog; disable/audience/publication changes are rechecked
every 30 seconds while open. Close/Escape, focus trapping, scroll lock, persistent
close controls, reduced-motion support and safe external links are preserved.
Failure to fetch announcements does not block the app. Existing chat, bell,
feedback and payment behavior stay unchanged.
