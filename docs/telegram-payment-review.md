# Manual payment confirmation from Telegram

New key purchases and renewals (VND and USDT) notify the configured private admin
chat when created and when the customer reports payment/submits a transaction hash.
Each review notice contains order reference, customer, type, plan/duration, exact
amount/currency and network/hash when supplied, plus **Xác minh thanh toán** and
**Từ chối**. Creation/customer reporting is explicitly NOT proof of receipt.

The configured admin must personally check receipt, recipient, amount, network and
the order match before pressing confirm. This is an intentional manual override of
the automatic VND/USDT verifier, not a blockchain/bank verification claim.

Callbacks require the configured sender ID and the exact private admin chat,
an enabled bridge, valid action and UUID. They call the same row-locked settlement
as the web/provider paths with explicit manual confirmation. Receipts are recorded
as manual:vnd/order or manual:usdt/order (actual event IDs use colon separators).
Terminal orders cannot be approved again; later automatic callbacks and repeated
button presses do not issue another key or extend the subscription again.
Existing provider event IDs survive fulfillment retries.

The **Đơn chờ** menu button or `/orders` reopens the ten most recently updated
pending/expired/received orders, including orders made before this update.
Insufficient stock or invalid plan changes remain queued/blocked rather than
claiming that an unusable key/plan was activated. No production schema migration.
Automatic backup and rollback remain disabled.
