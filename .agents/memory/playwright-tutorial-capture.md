---
name: Playwright tutorial capture
description: Reliable handling for browser-recorded tutorial assets in this workspace.
---

Browser recordings must be finalized by retaining the video handle, closing the browser context, and only then awaiting the file path. Validate duration, resolution, and sample frames before converting or uploading an asset.

**Why:** Playwright does not finalize a context-bound recording until that context closes. Waiting on the path first can deadlock the recorder and leave an incomplete raw video.

**How to apply:** For future tutorial capture, use bounded selector waits rather than network-idle waits, close the recording context in a `finally` block, then inspect the completed media with `ffprobe` and extracted frames. Do not upload short or partial captures.