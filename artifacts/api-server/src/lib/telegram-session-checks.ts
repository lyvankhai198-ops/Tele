type Account = { id: string; ownerUserId: string; status: string; sessionEncrypted: string | null };

/** Read-only identity checks, shared across tabs/users without blocking HTTP or sending messages. */
export function createTelegramSessionChecks(
  check: (accountId: string, ownerUserId: string) => Promise<unknown>,
  onError: (error: unknown) => void,
  now = Date.now,
) {
  const pending = new Map<string, Account>();
  const checking = new Set<string>();
  const checkedAt = new Map<string, number>();
  let active = 0;

  function drain() {
    while (active < 2 && pending.size) {
      const [id, account] = pending.entries().next().value!;
      pending.delete(id);
      checking.add(id);
      active++;
      void Promise.resolve().then(() => check(id, account.ownerUserId))
        .catch(onError)
        .finally(() => {
          checkedAt.set(id, now());
          checking.delete(id);
          active--;
          drain();
        });
    }
  }

  return (accounts: Account[]) => {
    const time = now();
    for (const [id, at] of checkedAt) if (time - at > 600_000) checkedAt.delete(id);
    for (const account of accounts) {
      if (account.status !== "connected" || !account.sessionEncrypted
        || checking.has(account.id) || pending.has(account.id)
        || time - (checkedAt.get(account.id) ?? -Infinity) < 120_000
        || pending.size >= 256) continue;
      pending.set(account.id, account);
    }
    drain();
  };
}
