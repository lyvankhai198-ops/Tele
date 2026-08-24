---
name: GitHub tree file modes
description: Preserve executable permissions when publishing source through the GitHub Git Data API.
---

When creating a Git tree through the GitHub Git Data API, set each executable script entry to mode `100755`; using a blanket `100644` mode changes executable files into non-executable files in the resulting commit.

**Why:** Operational scripts may be invoked directly by cron or deployment tooling. A mode-only regression can make a successful-looking deployment fail later.

**How to apply:** Preserve the existing file mode when building tree entries. Before deploying an API-created commit, inspect `git diff --summary` or `git ls-tree` for scripts that require execute permission.