/** Account clients are single-use. A lost RPC must not hold their queue forever. */
export class TelegramOperationTimeoutError extends Error {
  readonly code = "TELEGRAM_OPERATION_TIMEOUT";
  readonly phase: "connect" | "rpc";
  constructor(phase: "connect" | "rpc") {
    super(`TELEGRAM_${phase.toUpperCase()}_TIMEOUT`);
    this.phase = phase;
    this.name = "TelegramOperationTimeoutError";
  }
}

type SingleUseClient = {
  connect: (...args: any[]) => Promise<any>;
  invoke: (...args: any[]) => Promise<any>;
  destroy: () => Promise<void>;
};

export function guardTelegramClient<T extends SingleUseClient>(
  client: T,
  options: { connectMs?: number; rpcMs?: number; onTimeout?: (phase: "connect" | "rpc") => void } = {},
): T {
  let closed: TelegramOperationTimeoutError | undefined;
  const close = () => {
    // GramJS marks the client destroyed synchronously before awaiting sockets.
    // Do not await a socket here: teardown itself may be the blocked operation.
    try { void client.destroy().catch(() => {}); } catch { /* best effort */ }
  };
  async function run<R>(phase: "connect" | "rpc", milliseconds: number, operation: () => Promise<R>): Promise<R> {
    if (closed) throw closed;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        closed ??= new TelegramOperationTimeoutError(phase);
        close();
        options.onTimeout?.(phase);
        reject(closed);
      }, milliseconds);
    });
    try {
      return await Promise.race([
        Promise.resolve().then(operation).then(value => {
          if (closed) {
            close(); // A late connect must not leave a reopened sender behind.
            throw closed;
          }
          return value;
        }),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const connect = client.connect.bind(client);
  const invoke = client.invoke.bind(client);
  client.connect = ((...args: Parameters<T["connect"]>) =>
    run("connect", options.connectMs ?? 90_000, () => connect(...args))) as T["connect"];
  client.invoke = ((...args: Parameters<T["invoke"]>) =>
    run("rpc", options.rpcMs ?? 120_000, () => invoke(...args))) as T["invoke"];
  return client;
}

/** Preserve a send result even if a sender's shutdown promise never settles. */
export async function boundedTelegramCleanup(
  destroy: () => Promise<void>,
  milliseconds = 5_000,
  onFailure?: () => void,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(destroy),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TELEGRAM_CLEANUP_TIMEOUT")), milliseconds);
      }),
    ]);
  } catch {
    onFailure?.();
  } finally {
    clearTimeout(timer);
  }
}
