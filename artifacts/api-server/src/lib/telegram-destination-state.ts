/** Membership absence, not a temporary posting restriction. Retain historical rows. */
export const UNAVAILABLE_TELEGRAM_DESTINATION_REASON =
  "This destination is no longer available to the connected account";

export function isLeftTelegramEntity(entity: {
  left?: boolean; kicked?: boolean; className?: string;
}): boolean {
  return entity.left === true || entity.kicked === true
    || entity.className === "ChatForbidden" || entity.className === "ChannelForbidden";
}

export function destinationIdsToMarkUnavailableAfterSync(
  previousDestinations: Array<{ id: string; telegramId: string; topicId: number | null }>,
  syncedTelegramIds: ReadonlySet<string>,
  syncedDestinationKeys: ReadonlySet<string>,
  topicSyncVerifiedForTelegramIds: ReadonlySet<string>,
): string[] {
  const destinationKey = (telegramId: string, topicId: number | null) =>
    `${telegramId}:${topicId ?? "chat"}`;
  return previousDestinations.filter(destination => {
    if (!syncedTelegramIds.has(destination.telegramId)) return true;
    if (destination.topicId === null) return false;
    return topicSyncVerifiedForTelegramIds.has(destination.telegramId)
      && !syncedDestinationKeys.has(destinationKey(destination.telegramId, destination.topicId));
  }).map(destination => destination.id);
}
