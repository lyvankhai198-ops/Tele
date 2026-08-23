---
name: Campaign scheduling semantics
description: Confirmed product meaning of campaign repeat counts and delivery delays.
---

`repeatCount` means the number of complete rounds across the selected destinations, not the total number of messages. Total scheduled deliveries equal repeat count multiplied by the number of selected destinations.

Delay values are in seconds. A fixed round delay of 17,280 seconds means 4 hours 48 minutes between each destination's deliveries across consecutive rounds. Group delay only offsets destinations within the same round; it does not add another round interval.

**Why:** The user explicitly clarified on August 23, 2026 that selecting more destinations must not make each destination wait an extra round interval.

**How to apply:** Preserve this meaning when changing campaign scheduling, labels, validation, summaries, or delivery-plan generation. If product behavior changes, confirm the new semantics explicitly first.