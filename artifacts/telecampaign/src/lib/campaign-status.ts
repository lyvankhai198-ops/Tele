/** Display labels only: never change the status received from the API. */
const campaignStatusLabels: Readonly<Record<string, string>> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  stopped: "Paused",
  completed: "Completed",
  success: "Completed",
  failed: "Failed",
  error: "Failed",
  scheduled: "Scheduled",
  pending: "Pending",
};

export function campaignStatusSource(status: string): string {
  return Object.hasOwn(campaignStatusLabels, status) ? campaignStatusLabels[status] : "—";
}
