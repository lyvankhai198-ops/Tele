# Admin and bot improvements

- Fix UUID/text joins for expiring users and today's keys.
- Add private-admin user lookup, linked user profiles, daily summaries and worker status.
- A PostgreSQL session advisory lock prevents concurrent pollers. The durable cursor
  advances only after a handler and persistence succeed. Failed updates wait for
  retry; they are never silently skipped. Inbound support replies are deduplicated
  transactionally by Telegram chat/message identifiers. External sends can still
  be uncertain after a network failure; this is not a claim of universal exactly-once delivery.
- Confirmed-order amounts are separated by currency and from key valuations.
  Access revocation is not a refund. New revocations preserve the original payment
  date in an immutable receipt row; old revoked orders with no date history are
  explicitly flagged, not assigned an invented date.
- `/admin/tools` provides monitoring, daily report scheduling, audit history and
  bounded CSV exports (no plaintext keys/passwords/tokens; formula injection guarded).
- Daily summaries default to 21:00 in the configured application timezone. An
  uncertain scheduled send is not repeatedly sent automatically; manual reports
  remain available. Worker/disk alerts use the configured private admin chat.
- Admin web MFA is optional until enrolled. Setup requires the current password,
  a valid authenticator code and a ten-minute pending setup window. AES-GCM protects
  the secret at rest. Recovery codes are hashed, single-use, and shown only once.
  TOTP counters and user-row locks prevent replay/concurrent reuse. Enabling signs
  out other sessions; disabling requires password+code and signs out all sessions.
- State, receipts and audit rows use namespaced keys in the existing
  `system_settings` table; no production schema migration is required.
- Audit captures actor/action/target and safe before/after subscription, quota and
  system-setting snapshots. It never records request bodies or credentials.
- Dependency and frontend caches include dependency/source/environment fingerprints.
  API changes still rebuild the API; unchanged frontend inputs reuse existing assets.
- Routine deployment backups and automatic rollback remain disabled by request.
- A scheduled GitHub Actions workflow checks the public web/API every 15 minutes
  without credentials or an AI model. Failures appear in Actions; notification
  delivery depends on the repository/account's GitHub notification preferences.
  In-process bot alerts cannot deliver while the entire VPS or Telegram is down.
