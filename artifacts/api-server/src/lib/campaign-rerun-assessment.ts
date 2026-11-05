import { UNAVAILABLE_TELEGRAM_DESTINATION_REASON } from "./telegram-destination-state";
import { isLongPostingRestriction, INDEFINITE_POSTING_RESTRICTION, DATED_POSTING_RESTRICTION } from "./telegram-posting-permissions";

export type RerunCategory = "sendable" | "temporary" | "review" | "invalid";
export type RerunDestinationEvidence = {
  id: string; title: string; exists: boolean; canPost: boolean;
  permissionReason: string | null; permissionCheckedAt: Date | null;
  restrictedUntil: Date | null; pending: number; sending: number;
  uncertain: number; sent: number; failed: number; cancelled: number; attempted: number;
  lastSentAt: Date | null; lastFailedAt: Date | null; blocked?: boolean;
  lastError?: string | null;
};
export type RerunGroupAssessment = {
  id: string; name: string; category: RerunCategory; reason: string;
};
export type RerunAssessment = {
  category: RerunCategory; reason: string; groups: RerunGroupAssessment[];
  sentCount: number; failedCount: number; targetCount: number;
  canDelete: boolean;
};

/** Legacy classification remains available; explicit reruns retry past failures. */
export function assessCampaignRerun(input: {
  connected: boolean; groups: RerunDestinationEvidence[]; terminal: boolean; now?: number; retryAll?: boolean;
}): RerunAssessment {
  const now=input.now??Date.now();
  const groups = input.groups.map((g): RerunGroupAssessment => {
    if(input.retryAll){
      if(g.blocked)return{id:g.id,name:g.title,category:"invalid",reason:"blocked_by_cleanup"};
      const checked=g.permissionCheckedAt?.getTime()??0;
      const verified=checked>0&&checked<=now&&checked>=(g.lastSentAt?.getTime()??0);
      if(g.exists&&verified&&!g.canPost&&(
        g.permissionReason===INDEFINITE_POSTING_RESTRICTION
        ||g.permissionReason===DATED_POSTING_RESTRICTION&&Boolean(g.restrictedUntil&&g.restrictedUntil.getTime()>now)
      ))return{id:g.id,name:g.title,category:"invalid",reason:"posting_restricted"};
      if(g.exists&&verified&&!g.canPost&&!g.restrictedUntil
        &&g.permissionReason===UNAVAILABLE_TELEGRAM_DESTINATION_REASON)
        return{id:g.id,name:g.title,category:"invalid",reason:"membership_unavailable"};
      // Only explicit Telegram posting-denial codes, never network, flood,
      // disconnected-session or generic historical errors, authorize pruning.
      if(g.exists&&g.lastFailedAt&&g.lastFailedAt.getTime()>=(g.lastSentAt?.getTime()??0)
        &&/\b(?:CHAT_SEND_PLAIN_FORBIDDEN|CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHAT_RESTRICTED|CHAT_SEND_FORBIDDEN)\b/.test(g.lastError??""))
        return{id:g.id,name:g.title,category:"invalid",reason:"posting_restricted"};
      return{id:g.id,name:g.title,category:"sendable",reason:"retry_requested"};
    }
    if (g.sending || g.uncertain) return { id:g.id, name:g.title, category:"review", reason:"uncertain_delivery" };
    if (g.blocked) return { id:g.id, name:g.title, category:"invalid", reason:"blocked_by_cleanup" };
    if (!input.connected) return { id:g.id, name:g.title, category:"temporary", reason:"account_disconnected" };
    if (!g.exists) return { id:g.id, name:g.title, category:"review", reason:"missing_destination" };
    if (isLongPostingRestriction(g, input.now)) {
      return { id:g.id, name:g.title, category:"invalid", reason:"posting_restricted_long_term" };
    }
    // Only a completed membership sync, not CHAT_WRITE_FORBIDDEN or repeated
    // network errors, proves this account no longer has this destination.
    if (!g.canPost && g.permissionCheckedAt && !g.restrictedUntil
      && g.permissionReason === UNAVAILABLE_TELEGRAM_DESTINATION_REASON) {
      const lastEvidence=Math.max(g.lastSentAt?.getTime() ?? 0,g.lastFailedAt?.getTime() ?? 0);
      if (g.permissionCheckedAt.getTime()<lastEvidence) {
        return {id:g.id,name:g.title,category:"temporary",reason:"membership_needs_refresh"};
      }
      return { id:g.id, name:g.title, category:"invalid", reason:"membership_unavailable" };
    }
    if (g.restrictedUntil || !g.canPost) {
      return { id:g.id, name:g.title, category:"temporary", reason:"posting_restricted" };
    }
    if (g.lastFailedAt && (!g.lastSentAt || g.lastFailedAt > g.lastSentAt)) {
      return { id:g.id, name:g.title, category:"temporary", reason:"last_delivery_failed" };
    }
    return { id:g.id, name:g.title, category:"sendable",
      reason:g.sent ? "delivery_confirmed" : "ready_not_tested" };
  });
  const sentCount = input.groups.reduce((n,g)=>n+g.sent,0);
  const failedCount = input.groups.reduce((n,g)=>n+g.failed,0);
  const targetCount = input.groups.reduce((n,g)=>n+g.sent+g.failed+g.cancelled+g.pending+g.sending+g.uncertain,0);
  const category: RerunCategory = groups.some(g=>g.category==="review") || !groups.length ? "review"
    : groups.some(g=>g.category==="sendable") ? "sendable"
    : groups.every(g=>g.category==="invalid") ? "invalid" : "temporary";
  const reason = !groups.length ? "no_destination"
    : category === "sendable" ? (groups.every(g=>g.reason==="delivery_confirmed") ? "delivery_confirmed" : "ready_destinations")
    : category === "review" ? "uncertain_delivery"
    : category === "invalid" && input.retryAll ? (groups.some(g=>g.reason==="posting_restricted")?"posting_restricted":"membership_unavailable")
    : category === "invalid" ? (groups.some(g=>g.reason==="posting_restricted_long_term")
      ? "posting_restricted_long_term" : "membership_unavailable") : "temporary_failure";
  return { category, reason, groups, sentCount, failedCount, targetCount,
    canDelete: input.retryAll ? groups.length>0&&category==="invalid" : input.terminal && category==="invalid" && targetCount>0 && sentCount===0
      && input.groups.some(g=>g.attempted>0)
      && input.groups.every(g=>g.pending===0 && g.sending===0 && g.uncertain===0) };
}
