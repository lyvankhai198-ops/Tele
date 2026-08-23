---
name: Campaign scheduling semantics
description: Confirmed product meaning of campaign repeat counts and delivery delays.
---

`repeatCount` means the number of complete rounds across the selected destinations, not the total number of messages. Total scheduled deliveries equal repeat count multiplied by the number of selected destinations.

Delay values are in seconds. A fixed value of 17,280 seconds means 4 hours 48 minutes between scheduled deliveries, with the configured round delay also contributing at round boundaries.

**Why:** The user explicitly confirmed this interpretation on August 23, 2026.

**How to apply:** Preserve this meaning when changing campaign scheduling, labels, validation, summaries, or delivery-plan generation. If product behavior changes, confirm the new semantics explicitly first.