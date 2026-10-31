import { pool } from "@workspace/db";

export type StateClient = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
};
export async function readOperationalState<T>(key: string, fallback: T, client: StateClient = pool): Promise<T> {
  const result = await client.query("SELECT value FROM system_settings WHERE key=$1", [key]);
  return result.rows.length ? JSON.parse(result.rows[0].value) as T : fallback;
}
export async function writeOperationalState(key: string, value: unknown, client: StateClient = pool): Promise<void> {
  await client.query(
    "INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()",
    [key, JSON.stringify(value)],
  );
}

// A separate connection owns the lock until finally/unlock or process exit.
// Network calls must not hold an open database transaction.
export async function withOperationalLock<T>(name: number, action: (client: StateClient) => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  let locked = false;
  try {
    const result = await client.query("SELECT pg_try_advisory_lock(174643, $1) AS locked", [name]);
    locked = result.rows[0]?.locked === true;
    return locked ? await action(client) : null;
  } finally {
    let destroy = false;
    if (locked) {
      try { await client.query("SELECT pg_advisory_unlock(174643, $1)", [name]); }
      catch { destroy = true; }
    }
    client.release(destroy);
  }
}
