import {
  CalendarClock, ChevronDown, CirclePause, CircleStop, Copy, Eye, Filter,
  LoaderCircle, Pencil, Play, Plus, Search, Send, ShieldAlert, Trash2,
} from "lucide-react";
import type { Campaign } from "@workspace/api-client-react";
import { CampaignListFeedback } from "@/components/campaign-list-feedback";
import { EmptyState, Panel, PrimaryButton } from "@/components/layout/AppLayout";
import { useLanguage } from "@/lib/i18n";
import "./campaigns-workspace.css";

export type CampaignFilterStatus = "all" | "queued" | "running" | "paused" | "completed" | "draft" | "cancelled";
type Labels = {
  pageTitle: string; searchPlaceholder: string; statusAll: string; statusQueued: string;
  statusRunning: string; statusPaused: string; statusCompleted: string;
  dailyQuotaLabel: string; errorsLabel: string; scheduledLabel: string; detailDelayRound: string;
  detailsBtn: string; pauseBtn: string; editBtn: string; resumeBtn: string; cloneBtn: string;
  automaticResume: string; deleteTitle: string; deleteActiveHint: string;
  clonedDraft: string; userClonedDraft: string;
  emptyFilterTitle: string; emptyFilterDetail: string; emptyTitle: string; emptyDetail: string;
  createCampaignBtn: string;
};
type RowPresentation = {
  status: string; complete: number; active: boolean; autoResumes: boolean;
  safetyNote: string | null; schedule: string; dailyQuota: string;
};
type Props = {
  labels: Labels;
  rows: Campaign[]; accounts: { id: string; name: string; phone?: string | null }[];
  total: number | undefined; hasData: boolean; fetching: boolean; failed: boolean;
  loaded: number; loadTotal: number | null; updatedAt: number;
  search: string; status: CampaignFilterStatus; accountFilter: string; accountFilterLabel: string;
  supportMode: boolean; dataBlocked: boolean;
  bulkPending: boolean; bulkTemplatePending: boolean; bulkDeletePending: boolean;
  hasBulkJob: boolean; hasTemplateJob: boolean; templateUncertain: boolean; templateWaiting: boolean;
  clonePending: boolean; cloneSourceId?: string; deletePending: boolean;
  latestCompletedId: string | null; highlightedId: string | null;
  present: (campaign: Campaign) => RowPresentation;
  onSearch: (value: string) => void; onStatus: (value: CampaignFilterStatus) => void;
  onAccount: (value: string) => void; onReset: () => void; onRefresh: () => void;
  onCreate: () => void; onPauseAll: () => void; onRerun: () => void;
  onTemplate: () => void; onDeleteFiltered: () => void;
  onDetails: (campaign: Campaign) => void; onEdit: (campaign: Campaign) => void;
  onPause: (campaign: Campaign) => void; onQueue: (campaign: Campaign) => void;
  onClone: (campaign: Campaign) => void; onDelete: (campaign: Campaign) => void;
};

/** Presentation only. Loading, permissions, scheduling and mutations stay in the page controller. */
export function CampaignsWorkspaceView(p: Props) {
  const { t, language } = useLanguage();
  const c = p.labels;
  const number = (value: number) => value.toLocaleString(language);
  return <div className="tcw-campaigns">
    <div className="tcw-shell">
      <div className="tcw-content-grid">
        <main className="tcw-main-column">
          <section className="tcw-filter-panel" data-testid="campaigns-filter-toolbar" aria-label={t("Campaign filters")}>
            <div className="tcw-panel-heading">
              <div><span className="tcw-heading-icon"><Filter size={16} aria-hidden="true" /></span><h2>{t("Campaign filters")}</h2></div>
              <div className="tcw-filter-heading-actions">
                {(p.accountFilter || p.search || p.status !== "all") && <button type="button" className="tcw-reset-button" onClick={p.onReset} data-testid="campaigns-clear-filters">{t("Reset")}</button>}
                <span className="tcw-scope-tag" data-testid="campaigns-filter-count">{p.total === undefined ? "—" : `${number(p.rows.length)} / ${number(p.total)}`}</span>
              </div>
            </div>
            <div className="tcw-filter-grid">
              <label className="tcw-search-field">
                <span className="sr-only">{c.searchPlaceholder}</span><Search size={17} aria-hidden="true" />
                <input value={p.search} onChange={event => p.onSearch(event.target.value)} placeholder={c.searchPlaceholder} maxLength={160} data-testid="campaigns-search" />
              </label>
              <label className="tcw-select-field"><span className="sr-only">{t("Campaign status")}</span>
                <select value={p.status} aria-label={t("Campaign status")} onChange={event => p.onStatus(event.target.value as CampaignFilterStatus)} data-testid="campaigns-status">
                  <option value="all">{c.statusAll}</option><option value="queued">{c.statusQueued}</option>
                  <option value="running">{c.statusRunning}</option><option value="paused">{c.statusPaused}</option><option value="completed">{c.statusCompleted}</option>
                </select><ChevronDown size={15} aria-hidden="true" />
              </label>
              <label className="tcw-select-field"><span className="sr-only">{t("Telegram account")}</span>
                <select value={p.accountFilter} aria-label={t("Telegram account")} onChange={event => p.onAccount(event.target.value)} data-testid="campaigns-account-filter">
                  <option value="">{t("All accounts")}</option>
                  {p.accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.phone ? ` · ${account.phone}` : ""}</option>)}
                </select><ChevronDown size={15} aria-hidden="true" />
              </label>
            </div>
          </section>

          <section className="tcw-actions-panel" data-testid="campaigns-action-toolbar">
            <div className="tcw-actions-heading"><h2>{t("Bulk actions")}</h2><span className="tcw-scope-tag" title={p.accountFilterLabel}><Filter size={13} aria-hidden="true" /><span>{p.accountFilterLabel}</span></span></div>
            <div className="tcw-action-grid">
              <button type="button" onClick={p.onPauseAll} disabled={p.dataBlocked || p.bulkPending || p.bulkTemplatePending}
                className="tcw-action-button tcw-action-stop" data-testid="campaigns-pause-all">
                {p.bulkPending ? <LoaderCircle size={16} className="animate-spin" /> : <CircleStop size={16} />}<span>{t("Pause campaigns")}</span>
              </button>
              <button type="button" onClick={p.onRerun} disabled={(p.dataBlocked && !p.hasBulkJob) || p.bulkPending || p.bulkTemplatePending}
                className="tcw-action-button tcw-action-run" data-testid="campaigns-resume-all">
                {p.bulkPending ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}<span>{t(p.hasBulkJob ? "Rerun progress" : "Rerun campaigns")}</span>
              </button>
              {!p.supportMode && <button type="button" onClick={p.onTemplate}
                disabled={(!p.hasTemplateJob && !p.templateUncertain && p.dataBlocked) || p.bulkPending || (p.templateWaiting && !p.hasTemplateJob && !p.templateUncertain)}
                className="tcw-action-button" data-testid="campaigns-bulk-template">
                {p.bulkTemplatePending ? <LoaderCircle size={15} className="animate-spin" /> : <Pencil size={15} />}<span>{t(p.hasTemplateJob || p.templateUncertain ? "Template progress" : "Bulk templates")}</span>
              </button>}
              <button type="button" onClick={p.onDeleteFiltered} disabled={p.dataBlocked || p.bulkPending || p.bulkTemplatePending || p.bulkDeletePending}
                className="tcw-action-button tcw-action-delete" data-testid="campaigns-delete-filtered">
                {p.bulkDeletePending ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}<span>{t("Delete campaigns")}</span>
              </button>
            </div>
          </section>

          <section className="tcw-list-section" aria-label={c.pageTitle}>
            <div className="tcw-list-heading"><h2>{c.pageTitle} <span>{p.hasData ? number(p.rows.length) : "—"}</span></h2></div>
            <Panel className="tcw-campaign-panel overflow-hidden">
              <CampaignListFeedback language={language} hasData={p.hasData} fetching={p.fetching}
                failed={p.failed} empty={!p.rows.length} loaded={p.loaded} total={p.loadTotal} updatedAt={p.updatedAt} onRetry={p.onRefresh}>
                {p.rows.length ? <div className="divide-y divide-[#e9eeec]">{p.rows.map(campaign => {
                  const account = p.accounts.find(item => item.id === campaign.telegramAccountId);
                  const row = p.present(campaign);
                  const latest = campaign.id === p.latestCompletedId;
                  const highlighted = campaign.id === p.highlightedId;
                  const tone = campaign.status === "completed_with_errors" ? "has-errors" : campaign.status === "completed" ? "is-complete" : "";
                  return <article key={campaign.id} className={`tcw-campaign-row ${latest ? "is-latest" : ""} ${highlighted ? "is-highlighted" : ""}`} data-testid={`campaign-row-${campaign.id}`}>
                    <div className="tcw-row-main">
                      <div className="tcw-row-primary">
                        <button type="button" onClick={() => p.onDetails(campaign)} title={campaign.name} className={`tcw-campaign-name ${latest ? "latest" : ""}`}>{campaign.name}</button>
                        <span className={`tcw-status tcw-status-${campaign.status === "completed_with_errors" ? "errors" : campaign.status}`}><span className="tcw-status-led" />{row.status}</span>
                      </div>
                      <div className="tcw-progress-area">
                        <div className="tcw-progress-copy"><span><strong>{number(campaign.completedCount)}</strong> / {number(campaign.targetCount)} {t("Processed")}</span><span className="tcw-progress-percent">{row.complete}%</span></div>
                        <div className={`tcw-progress-track ${tone}`} role="progressbar" aria-label={`${t("Operation progress")}: ${campaign.name}`} aria-valuenow={row.complete} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${row.complete}%` }} /></div>
                      </div>
                      <div className="tcw-row-facts">
                        <span className="tcw-fact"><Send size={14} aria-hidden="true" /><b>{number(campaign.sentCount)}</b> {t("Sent")}</span>
                        <span className={`tcw-fact ${campaign.failedCount ? "fact-error" : ""}`}><ShieldAlert size={14} aria-hidden="true" /><b>{number(campaign.failedCount)}</b> {c.errorsLabel}</span>
                        <span className="tcw-fact tcw-quota"><span className="tcw-quota-label">{c.dailyQuotaLabel}</span><b>{row.dailyQuota}</b></span>
                      </div>
                    </div>
                    <div className="tcw-row-meta">
                      <div className="tcw-account-meta"><span className="tcw-account-avatar">{account?.name?.slice(0, 1) || "T"}</span><div><strong title={account?.name}>{account?.name || t("Telegram account")}</strong><small>{account?.phone || t("Telegram account")}</small></div></div>
                      <div className="tcw-schedule-meta"><CalendarClock size={15} aria-hidden="true" /><span><small>{c.scheduledLabel}</small><strong>{row.schedule}</strong></span></div>
                      <div className="tcw-delay-meta"><span>{campaign.timingMode === "round" ? c.detailDelayRound : t("Legacy send delay:")}</span><strong>{campaign.roundDelayMinSeconds}–{campaign.roundDelayMaxSeconds}s</strong></div>
                    </div>
                    {campaign.timingMode === "round" && campaign.destinationIds.length > 1 && (campaign.groupIntervalSeconds ?? 0) > 0 && <p className="tcw-group-spacing">{t("Group spacing:")} {(campaign.groupIntervalSeconds ?? 0) / 60} {t("min")}</p>}
                    {campaign.status === "queued" && <div className="tcw-waiting-note"><CalendarClock size={14} aria-hidden="true" /><span>{t("Waiting to send")}</span></div>}
                    {highlighted && <p className="tcw-highlight-note">Hãy kiểm tra chi tiết lỗi, xem nhóm đang chạy trong chiến dịch có quyền đăng không, sau đó chỉnh sửa để chạy lại chiến dịch.</p>}
                    {row.safetyNote && <p className="tcw-safety-note">{row.safetyNote}</p>}
                    <div className={`tcw-row-actions ${campaign.status === "paused" || campaign.status === "draft" ? "has-resume" : ""}`}>
                      <button type="button" onClick={() => p.onDetails(campaign)} className="tcw-button-secondary"><Eye size={15} />{c.detailsBtn}</button>
                      {row.active
                        ? <button type="button" onClick={() => p.onPause(campaign)} className="tcw-button-stop"><CirclePause size={15} />{c.pauseBtn}</button>
                        : campaign.status === "draft"
                          ? <><button type="button" onClick={() => p.onEdit(campaign)} className="tcw-button-secondary"><Pencil size={14} />{c.editBtn}</button><button type="button" onClick={() => p.onQueue(campaign)} className="tcw-button-primary"><Play size={14} />{c.resumeBtn}</button></>
                          : campaign.status === "paused"
                            ? <><button type="button" onClick={() => p.onEdit(campaign)} className="tcw-button-secondary"><Pencil size={14} />{c.editBtn}</button>{row.autoResumes ? <span className="tcw-automatic-resume">{c.automaticResume}</span> : <button type="button" onClick={() => p.onQueue(campaign)} className="tcw-button-primary"><Play size={14} />{c.resumeBtn}</button>}</>
                            : campaign.status === "completed" || campaign.status === "completed_with_errors"
                              ? <button type="button" onClick={() => p.onEdit(campaign)} className="tcw-button-secondary"><Pencil size={14} />{c.editBtn}</button>
                              : null}
                      {!p.supportMode && <button type="button" onClick={() => p.onClone(campaign)} disabled={p.clonePending} className="tcw-button-clone" data-testid={`campaign-clone-${campaign.id}`}>
                        {p.clonePending && p.cloneSourceId === campaign.id ? <LoaderCircle size={15} className="animate-spin" /> : <Copy size={15} />}{c.cloneBtn}
                      </button>}
                      <button type="button" onClick={() => p.onDelete(campaign)} disabled={p.deletePending}
                        title={row.active ? c.deleteActiveHint : c.deleteTitle} aria-label={`${c.deleteTitle}: ${campaign.name}`} className="tcw-delete-icon" data-testid={`campaign-delete-${campaign.id}`}><Trash2 size={15} /></button>
                    </div>
                    {campaign.cloneMode === "admin" && campaign.status === "draft" && <p className="tcw-clone-note">{c.clonedDraft}</p>}
                    {campaign.cloneMode === "user" && campaign.status === "draft" && <p className="tcw-clone-note">{c.userClonedDraft}</p>}
                  </article>;
                })}</div> : <EmptyState icon={Plus}
                  title={p.search || p.status !== "all" || p.accountFilter ? c.emptyFilterTitle : c.emptyTitle}
                  detail={p.search || p.status !== "all" || p.accountFilter ? c.emptyFilterDetail : c.emptyDetail}
                  action={!p.search && !p.accountFilter && p.status === "all" ? <PrimaryButton onClick={p.onCreate}><Plus size={16} />{c.createCampaignBtn}</PrimaryButton> : undefined} />}
              </CampaignListFeedback>
            </Panel>
          </section>
        </main>
      </div>
    </div>
  </div>;
}
