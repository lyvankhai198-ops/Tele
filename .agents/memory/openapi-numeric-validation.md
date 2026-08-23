---
name: OpenAPI numeric validation
description: Generator compatibility rule for numeric request fields.
---

Use OpenAPI `type: number` for API numeric fields that must be whole numbers, then enforce `Number.isInteger` at the API route boundary.

**Why:** The current OpenAPI generator emits `zod.int()` for `type: integer`, but the workspace uses Zod 3 where that module-level helper is unavailable, causing generated-library typechecks to fail.

**How to apply:** Keep OpenAPI minimum/maximum constraints on the number, and add route validation for integer-only semantics and cross-field rules such as minimum delay not exceeding maximum delay.