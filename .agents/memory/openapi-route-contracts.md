---
name: OpenAPI route contracts
description: Keeping generated client endpoints and server registrations aligned.
---

The OpenAPI verb and path are the canonical contract: every generated client mutation must have an identically registered server route.

**Why:** A path mismatch can skip the intended router and fall through to unrelated middleware, producing a misleading authorization or service-unavailable response instead of the feature response.

**How to apply:** When adding or changing an endpoint, compare its HTTP verb and complete path in the OpenAPI spec, generated client, and server registration. Verify the real HTTP mutation after code generation, not just the underlying service function.