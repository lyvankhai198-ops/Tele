---
name: Shared VPS deployments
description: Safety boundaries and build requirements for deploying TeleCampaign to its shared VPS.
---

Keep TeleCampaign isolated from other VPS applications: change only its source directory, process, port, database, and Nginx host route.

**Why:** The VPS hosts unrelated services, so broad process, proxy, or database operations can create outages outside TeleCampaign.

**How to apply:** Pull and build only the TeleCampaign repository, restart only its dedicated PM2 process, and verify its local health endpoint plus the public HTTPS host afterward.

The TeleCampaign Vite production build requires both its runtime port and root base path in the build environment.

**Why:** The Vite config validates these variables even for a static production build; omitting either stops deployment before the API restart.

**How to apply:** Supply the dedicated API port and a root base path when building the frontend on the VPS, then build the API and restart only the TeleCampaign process.