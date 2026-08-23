import app from "./app";
import { logger } from "./lib/logger";
import { getUnmappedLegacyOwnerCount } from "./lib/auth";
import { rebaseLegacyPastScheduleCampaigns, startCampaignWorker } from "./lib/campaigns";

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
  if (unmappedOwners === 0) {
    startCampaignWorker();
  } else {
    logger.warn({ unmappedOwners }, "Campaign worker is paused until legacy ownership is migrated");
  }
  });
}).catch((err) => {
  logger.error({ err }, "Unable to inspect authentication migration state");
  process.exit(1);
});
