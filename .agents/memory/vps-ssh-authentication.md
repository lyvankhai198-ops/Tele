---
name: VPS SSH authentication
description: Safe connection behavior for the shared TeleCampaign VPS when secret-backed SSH key material cannot be parsed.
---

Validate the configured SSH private key locally before attempting a deployment. If it cannot be parsed by OpenSSH, use the already configured password authentication as a non-interactive fallback without printing either credential.

**Why:** Secret-backed private-key formatting can be incompatible with OpenSSH even after safe newline normalization, while a working password fallback prevents an unnecessary deployment block.

**How to apply:** Keep strict host verification enabled, pass authentication only through environment-backed tooling, and run the usual TeleCampaign-only deployment boundaries after connection succeeds.