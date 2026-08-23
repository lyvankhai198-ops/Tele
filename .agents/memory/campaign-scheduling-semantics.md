---
name: Campaign scheduling semantics
description: Confirmed product meaning of campaign repeat counts and delivery delays.
---

`repeatCount` means the number of complete rounds across the selected destinations, not the total number of messages. Total scheduled deliveries equal repeat count multiplied by the number of selected destinations.

All destinations in the same round share one scheduled timestamp and have no configurable inter-group delay. Round delays are measured in seconds between round starts; a fixed delay of 17,280 seconds means 4 hours 48 minutes between consecutive rounds. If a selected schedule is already in the past, treat the campaign as immediate and anchor its round delays at configuration time instead.

**Why:** The user explicitly clarified on August 23, 2026 that selecting more destinations must not make each destination wait longer, then removed group-delay configuration altogether. They also confirmed that a 86,400-second delay must be a full day from the time a campaign is set, not from a defaulted past midnight.

**How to apply:** Preserve the shared timestamp for every destination in a round when changing campaign scheduling, labels, validation, defaults, summaries, or delivery-plan generation. Keep a genuinely future selected schedule; normalize a past selection to an immediate campaign. Only round delay settings may be exposed or used for new/rebuilt schedules unless the product behavior is explicitly changed.