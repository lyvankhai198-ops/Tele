---
name: VPS host-key verification
description: How to establish strict SSH host verification for the shared TeleCampaign VPS when the runner has no pre-existing known_hosts entry.
---

Do not use `StrictHostKeyChecking=no` for the TeleCampaign VPS. If the runner does not know the VPS ED25519 key, obtain its fingerprint from a trusted VPS console or provider source, scan the host key, compare fingerprints exactly, and use the verified scan as a temporary `UserKnownHostsFile`.

**Why:** A password fallback solves a malformed private key but must not turn into trust-on-first-use; shared-VPS deployment credentials are valuable and a host-key mismatch must block the deployment.

**How to apply:** Treat screenshots of terminal output as potentially ambiguous for characters such as `1/l`, `O/Q`, and `W/w`. Enlarge the precise output or ask for copied terminal text, then compare the scanned key's `ssh-keygen -lf` fingerprint exactly before any SSH command.