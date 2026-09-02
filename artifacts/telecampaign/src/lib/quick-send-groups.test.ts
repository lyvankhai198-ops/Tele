import assert from "node:assert/strict";
import {
  GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT,
  filterDestinationsForAccount,
  getLibraryGroupStatus,
  splitGroupLibrary,
} from "./quick-send-groups.ts";

const destinations = [
  { id: "a-1", accountId: "account-a", title: "Alpha group", parentTitle: null, username: "@alpha" },
  { id: "a-2", accountId: "account-a", title: "Announcements", parentTitle: "Alpha group", username: null },
  { id: "b-1", accountId: "account-b", title: "Beta group", parentTitle: null, username: "@beta" },
];

assert.deepEqual(
  filterDestinationsForAccount(destinations, "account-a", ""),
  destinations.slice(0, 2),
);
assert.deepEqual(
  filterDestinationsForAccount(destinations, "account-a", "announcements"),
  [destinations[1]],
);
assert.deepEqual(
  filterDestinationsForAccount(destinations, "account-a", "alpha"),
  destinations.slice(0, 2),
);
assert.deepEqual(
  filterDestinationsForAccount(destinations, "account-a", "beta"),
  [],
);

const libraryGroups = [{ id: "library-1" }, { id: "library-2" }, { id: "library-3" }, { id: "library-4" }];
const trialLibrary = splitGroupLibrary(libraryGroups, false);
assert.equal(GROUP_LIBRARY_TRIAL_PREVIEW_LIMIT, 2);
assert.deepEqual(trialLibrary.visibleGroups, libraryGroups.slice(0, 2));
assert.equal(trialLibrary.hiddenCount, 2);

const entitledLibrary = splitGroupLibrary(libraryGroups, true);
assert.deepEqual(entitledLibrary.visibleGroups, libraryGroups);
assert.equal(entitledLibrary.hiddenCount, 0);

const postableDestinationIds = new Set(["destination-a"]);
assert.equal(
  getLibraryGroupStatus(
    { accountMemberships: [{ accountId: "account-a", destinationId: "destination-a", canPost: false }] },
    "account-a",
    postableDestinationIds,
  ),
  "joined",
);
assert.equal(
  getLibraryGroupStatus(
    { accountMemberships: [{ accountId: "account-a", destinationId: "destination-b", canPost: false }] },
    "account-a",
    postableDestinationIds,
  ),
  "review",
);
assert.equal(
  getLibraryGroupStatus({ accountMemberships: [] }, "account-a", postableDestinationIds),
  "not_joined",
);

console.log("Quick send group separation checks passed.");