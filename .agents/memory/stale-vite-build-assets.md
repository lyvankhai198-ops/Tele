---
name: Stale Vite build assets
description: Cleanup rule for deleted TeleCampaign public assets in production builds.
---

When a public asset directory is removed from source, delete the corresponding directory under the production Vite dist as part of the same deploy.

**Why:** The build can leave files from a previous output in place, allowing removed assets to remain reachable even though the source and current bundle no longer reference them.

**How to apply:** Limit cleanup to the TeleCampaign-owned dist path, then verify the old asset is absent; an SPA fallback may still return HTML with HTTP 200 for an unknown URL.