export const DESTINATION_SYNC_TTL_MS = 5 * 60 * 1000;

export function destinationSyncIsFresh(
  lastSyncAt: Date | string | null | undefined,
  now = Date.now(),
) {
  if (!lastSyncAt) return false;
  const timestamp = lastSyncAt instanceof Date ? lastSyncAt.getTime() : Date.parse(lastSyncAt);
  if (!Number.isFinite(timestamp)) return false;
  const age = now - timestamp;
  return age >= -DESTINATION_SYNC_TTL_MS && age <= DESTINATION_SYNC_TTL_MS;
}