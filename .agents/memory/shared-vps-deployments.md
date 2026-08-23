---
name: Shared VPS deployments
description: Safety boundaries and build requirements for deploying TeleCampaign to its shared VPS.
---

Keep TeleCampaign isolated from other VPS applications: change only its source directory, process, port, database, and Nginx host route.

**Why:** The VPS hosts unrelated services, so broad process, proxy, or database operations can create outages outside TeleCampaign.

**How to apply:** Pull and build only the TeleCampaign repository, restart only its dedicated PM2 process, and verify its local health endpoint plus the public HTTPS host afterward.

The user has explicitly confirmed that CheckGPT, AutoOrder, Bot Quà Tặng, Github-Importer2, and all other VPS services or `/var/www` deployments are protected and out of scope.

**Why:** The VPS is shared by multiple unrelated products, and deployment work must not risk their availability.

**How to apply:** Never restart, repair, rebuild, reconfigure, or inspect-mutably any non-TeleCampaign project; limit deployment commands to `/opt/telecampaign` and `telecampaign-api`.

TeleCampaign backup and restore tooling must use the fixed `/etc/telecampaign/api.env` and store backups only below `/var/backups/telecampaign`.

**Why:** Configurable environment-file or backup-directory paths could accidentally select, expose, or delete another shared-VPS project's data.

**How to apply:** Reject overrides for the environment file, canonicalize backup paths under the TeleCampaign-owned root, fence only `telecampaign-api` during restores, and leave it stopped if recovery fails.

The current public HTTPS host for TeleCampaign is `https://tele.khaimmo.shop`.

**Why:** This is the user-confirmed public route for the VPS deployment.

**How to apply:** Use this host when verifying the deployed frontend and public API routing; do not substitute a guessed Replit or development URL.

The TeleCampaign Vite production build requires both its runtime port and root base path in the build environment.

**Why:** The Vite config validates these variables even for a static production build; omitting either stops deployment before the API restart.

**How to apply:** Supply the dedicated API port and a root base path when building the frontend on the VPS, then build the API and restart only the TeleCampaign process.

The VPS API environment must include a valid `SESSION_SECRET` before account credentials or other encrypted values can be saved.

**Why:** Missing encryption configuration can leave health and read-only endpoints working while credential-saving requests fail at runtime.

**How to apply:** Verify only the secret's presence in `/etc/telecampaign/api.env`; never print it. Restart only `telecampaign-api` after changing the file.

The VPS deploys from GitHub `main`, not directly from the workspace task branch.

**Why:** A completed workspace task can be newer than `origin/main`; the VPS will continue serving the old version until GitHub is updated.

**How to apply:** Confirm the remote branch SHA before deployment. Publish the validated source changes to GitHub through the configured integration, then use a fast-forward pull, build both TeleCampaign artifacts, restart only `telecampaign-api`, and verify the public HTTPS health endpoint.