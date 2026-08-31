---
name: Self-hosted CAPTCHA rendering
description: Security boundary for image CAPTCHA generation and proxy-bound IP verification.
---

Self-hosted authentication CAPTCHA responses must contain only a randomized raster image; never send answer characters as SVG text or another client-decodable representation.

**Why:** Base64 encoding does not hide SVG text. A client can decode it and submit the answer without image recognition, defeating the abuse barrier.

**How to apply:** Keep the answer and intermediate vector markup server-side, rasterize to PNG with varied typography, transforms, displacement, and noise, then store only the answer hash in the short-lived single-use challenge.

Production IP binding must trust forwarded headers only from the local reverse proxy.

**Why:** Trusting a hop count or broad private network lets a directly reachable caller forge its apparent IP and evade CAPTCHA/auth issuance limits.

**How to apply:** In the single-host Nginx topology, trust loopback only in production and keep the API port unavailable to public clients.