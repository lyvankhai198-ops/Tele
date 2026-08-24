---
name: App Storage upload paths
description: Reliable object-path handling when creating direct browser uploads through App Storage.
---

For a direct browser upload, create and return the internal `/objects/...` path together with the presigned PUT URL. Do not reconstruct the object path by parsing the signed URL.

**Why:** Signed URLs are transport details whose URL shape can vary by sidecar or signing provider, while notification media validation and signed reads need the canonical internal path.

**How to apply:** Allocate the private object name first, derive its entity path from that known name, and then sign the PUT request. Persist only the canonical path in application metadata.