export const QUICK_SEND_SUCCESS_THRESHOLD = 3;

export function shouldShowQuickSend(successfulCampaigns: number): boolean {
  return successfulCampaigns < QUICK_SEND_SUCCESS_THRESHOLD;
}