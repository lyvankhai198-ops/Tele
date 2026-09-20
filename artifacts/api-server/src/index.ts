import app from "./app";
import { logger } from "./lib/logger";
import { getUnmappedLegacyOwnerCount } from "./lib/auth";
import { rebaseLegacyPastScheduleCampaigns, startCampaignWorker } from "./lib/campaigns";
import { startNotificationMediaCleanup } from "./lib/notificationMediaCleanup";
import { startActivityLogCleanup } from "./lib/activity";
import { startAdminGroupJoinWorker } from "./lib/admin-group-join-worker";
import { startSubscriptionReminderWorker } from "./lib/subscription-reminder-worker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

void getUnmappedLegacyOwnerCount().then(async (unmappedOwners) => {
  await rebaseLegacyPastScheduleCampaigns();
  app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startNotificationMediaCleanup();
  startActivityLogCleanup();
  if (unmappedOwners === 0 && process.env.TELECAMPAIGN_DISABLE_WORKER !== "true") {
    startCampaignWorker();
        if (process.env.TELECAMPAIGN_DISABLE_GROUP_JOIN_WORKER !== "true") {
          void startAdminGroupJoinWorker();
        }
        if (process.env.TELECAMPAIGN_DISABLE_SUBSCRIPTION_REMINDER_WORKER !== "true") {
          void startSubscriptionReminderWorker();
        }
  } else if (process.env.TELECAMPAIGN_DISABLE_WORKER === "true") {
    logger.warn("Campaign worker is disabled by TELECAMPAIGN_DISABLE_WORKER");
  } else {
    logger.warn({ unmappedOwners }, "Campaign worker is paused until legacy ownership is migrated");
  }
  });
}).catch((err) => {
  logger.error({ err }, "Unable to inspect authentication migration state");
  process.exit(1);
});
