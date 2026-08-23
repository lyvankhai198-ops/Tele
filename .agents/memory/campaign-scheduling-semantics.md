---
name: Campaign scheduling semantics
description: Confirmed product meaning of campaign repeat counts and delivery delays.
---

`repeatCount` means the number of complete rounds across the selected destinations, not the total number of messages. Total scheduled deliveries equal repeat count multiplied by the number of selected destinations.

All destinations in the same round share one scheduled timestamp and have no configurable inter-group delay. Round delays are measured in seconds between round starts; a fixed delay of 17,280 seconds means 4 hours 48 minutes between consecutive rounds.

**Why:** The user explicitly clarified on August 23, 2026 that selecting more destinations must not make each destination wait longer, then removed group-delay configuration altogether.

**How to apply:** Preserve the shared timestamp for every destination in a round when changing campaign scheduling, labels, validation, defaults, summaries, or delivery-plan generation. Only round delay settings may be exposed or used for new/rebuilt schedules unless the product behavior is explicitly changed.