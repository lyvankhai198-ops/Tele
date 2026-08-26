---
name: Static frontend release verification
description: How to distinguish a stale browser SPA from a VPS static-build deployment issue.
---

Verify a static frontend release from the public domain, not only from the VPS filesystem: compare the public HTML's hashed JavaScript asset and its bytes with the built asset on the server.

**Why:** A browser tab already running a single-page app keeps its existing JavaScript in memory. The server can be correct while the user still sees the prior interface until the document reloads.

**How to apply:** After a frontend-only deploy, confirm the public HTML references the intended new asset and that the asset contains the changed UI. Tell the user to reload once; if a new release must force a fresh client asset, make a small relevant frontend change so the build emits a new content-hashed filename.