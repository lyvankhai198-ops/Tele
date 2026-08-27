import assert from "node:assert/strict";
import { destinationIdsToMarkUnavailableAfterSync } from "./telegram";

const previousDestinations = [
  { id: "group-present", telegramId: "100", topicId: null },
  { id: "group-missing", telegramId: "200", topicId: null },
  { id: "topic-present", telegramId: "300", topicId: 2 },
  { id: "topic-missing", telegramId: "300", topicId: 3 },
  { id: "topic-not-verified", telegramId: "400", topicId: 2 },
];
const original = JSON.stringify(previousDestinations);

const unavailableIds = destinationIdsToMarkUnavailableAfterSync(
  previousDestinations,
  new Set(["100", "300", "400"]),
  new Set(["100:chat", "300:2"]),
  new Set(["300"]),
);

assert.deepEqual(unavailableIds, ["group-missing", "topic-missing"]);
assert.equal(JSON.stringify(previousDestinations), original);
assert.equal(previousDestinations.length, 5);

console.log("Telegram destination retention checks passed.");