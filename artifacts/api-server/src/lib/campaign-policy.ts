export type DailyQuotaState = {
  sentToday: number;
  reservedToday: number;
};

/**
 * A delivery slot is available only when sent and in-flight reservations are
 * both included in the owner's daily allowance.
 */
export function canReserveDailyQuota(
  state: DailyQuotaState,
  limit: number | null,
): boolean {
  return limit === null || state.sentToday + state.reservedToday < limit;
}

export function isWithinDailyQuota(
  state: DailyQuotaState,
  limit: number | null,
): boolean {
  return limit === null || state.sentToday + state.reservedToday <= limit;
}