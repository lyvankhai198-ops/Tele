---
name: Dashboard video delivery
description: Browser compatibility constraints for administrator notification video playback.
---

Notification media must be served with HTTP byte-range support. The downloadable tutorial source remains an H.264 MP4, while the notification shown in the development preview uses VP9 WebM.

**Why:** The development preview's Chromium reported `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` for a valid H.264 MP4 (verified independently with ffprobe). VP9 WebM loaded metadata and played successfully. `sendFile` also produced a transient local-stream failure; explicit ranged streams were reliable.

**How to apply:** Keep notification delivery compatible with `Range` requests (including suffix ranges). When verifying a video in the preview, prefer a VP9 WebM upload if an H.264 MP4 has no supported decoder; retain the MP4 as the downloadable/exported deliverable when required.