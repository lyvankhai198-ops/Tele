/** Durable message references only. This module never changes an order or entitlement. */
type Query = (text: string, values?: any[]) => Promise<{ rows: any[] }>;
type Call = (method: string, payload: Record<string, unknown>) => Promise<unknown>;
export const REVIEW_MESSAGE_PREFIX = "purchase_review_message:";
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const FINAL = new Set(["paid", "cancelled", "rejected", "revoked"]);

export function reviewMessageOrderId(text: string): string | null {
  if (!/^(?:🧾 ĐƠN CHỜ XÁC MINH THANH TOÁN|💳 KHÁCH BÁO ĐÃ THANH TOÁN — CHƯA XÁC MINH)\n/.test(text)) return null;
  const match = text.match(/^ID đơn: ([a-f0-9-]{36})$/im);
  return match && UUID.test(match[1]) ? match[1].toLowerCase() : null;
}

export function createPurchaseReviewMessages(deps: {
  query: Query; call: Call; warn: () => void; now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let running = false;
  async function remember(orderId: string, chatId: string, messageId: number) {
    if (!UUID.test(orderId) || !/^-?\d+$/.test(chatId) || !Number.isSafeInteger(messageId) || messageId < 1) {
      throw new Error("INVALID_PURCHASE_MESSAGE_REFERENCE");
    }
    const key = `${REVIEW_MESSAGE_PREFIX}${orderId.toLowerCase()}:${chatId}:${messageId}`;
    await deps.query(
      "INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING",
      [key, JSON.stringify({ orderId: orderId.toLowerCase(), chatId, messageId, attempts: 0, nextAttemptAt: 0 })],
    );
  }
  async function isReviewable(orderId: string) {
    const result = await deps.query("SELECT status FROM purchase_orders WHERE id=$1", [orderId]);
    return ["pending", "expired", "received"].includes(result.rows[0]?.status);
  }
  async function reconcile(chatId: string) {
    const stats = { deleted: 0, resolved: 0, absent: 0, retry: 0 };
    if (running) return stats;
    running = true;
    const deadline = now() + 10_000;
    try {
      const result = await deps.query(
        `SELECT s.key,s.value,p.status,p.reference FROM system_settings s
         JOIN purchase_orders p ON p.id::text=split_part(s.key,':',2)
         WHERE starts_with(s.key,$1) AND p.status IN ('paid','cancelled','rejected','revoked')
           AND s.value::jsonb->>'chatId'=$2
           AND s.value::jsonb->>'outcome' IS NULL
           AND COALESCE((s.value::jsonb->>'nextAttemptAt')::bigint,0)<=$3
         ORDER BY s.updated_at,s.key LIMIT 10`, [REVIEW_MESSAGE_PREFIX, chatId, now()],
      );
      for (const row of result.rows) {
        if (now() >= deadline) break;
        const ref = JSON.parse(row.value);
        if (!FINAL.has(row.status) || ref.chatId !== chatId || !UUID.test(ref.orderId) ||
            !Number.isSafeInteger(ref.messageId) || ref.messageId < 1 ||
            row.key !== `${REVIEW_MESSAGE_PREFIX}${ref.orderId}:${chatId}:${ref.messageId}`) continue;
        const payload = { chat_id: chatId, message_id: ref.messageId };
        let outcome: "deleted" | "resolved" | "absent" | undefined;
        try {
          const removed = await deps.call("deleteMessage", payload);
          if (removed !== true) throw new Error("DELETE_NOT_CONFIRMED");
          outcome = "deleted";
        } catch (error) {
          const reason = error instanceof Error ? error.message : "";
          if (/message to delete not found/i.test(reason)) outcome = "absent";
          else if (/message (?:can'?t|cannot) be deleted|message_delete_forbidden|message is too old/i.test(reason)) {
            // Telegram normally refuses deletion after 48h. Resolve the old
            // review card in place instead of leaving actionable payment buttons.
            try {
              const label = row.status === "paid" ? "Đã xác minh thanh toán" :
                row.status === "cancelled" ? "Đơn đã huỷ" :
                row.status === "revoked" ? "Đơn đã thu hồi" : "Đơn đã từ chối";
              const edited = await deps.call("editMessageText", {
                ...payload, text: `${label}\nĐơn: ${String(row.reference).slice(0, 140)}`,
                reply_markup: { inline_keyboard: [] },
              });
              if (!edited) throw new Error("EDIT_NOT_CONFIRMED");
              outcome = "resolved";
            } catch (editError) {
              if (editError instanceof Error && /message is not modified/i.test(editError.message)) outcome = "resolved";
            }
          }
        }
        if (outcome) {
          await deps.query("UPDATE system_settings SET value=$2,updated_at=now() WHERE key=$1",
            [row.key, JSON.stringify({ ...ref, outcome, resolvedAt: now() })]);
          stats[outcome] += 1;
        } else {
          const attempts = Math.min(Number(ref.attempts || 0) + 1, 20);
          await deps.query("UPDATE system_settings SET value=$2,updated_at=now() WHERE key=$1",
            [row.key, JSON.stringify({ ...ref, attempts,
              nextAttemptAt: now() + Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 10)) })]);
          stats.retry += 1;
        }
      }
    } catch {
      deps.warn();
    } finally {
      running = false;
    }
    return stats;
  }
  return { remember, isReviewable, reconcile };
}
