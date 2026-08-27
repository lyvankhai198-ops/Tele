export function isSubscriptionActiveAt(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || expiresAt > now;
}