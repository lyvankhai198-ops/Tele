const accountSyncs = new Map<string, Promise<unknown>>();

export function runTelegramAccountSyncOnce<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
  const existing = accountSyncs.get(accountId);
  if (existing) return existing as Promise<T>;

  const pending = operation();
  accountSyncs.set(accountId, pending);
  void pending.finally(() => {
    if (accountSyncs.get(accountId) === pending) accountSyncs.delete(accountId);
  }).catch(() => {
    // The caller owns the original rejection; this prevents an unhandled
    // rejection from the cleanup-only promise returned by finally().
  });
  return pending;
}