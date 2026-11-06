import { ArrowDownToLine, ChevronDown, Hash, Layers3, RefreshCw, Search, Send, Users, X } from "lucide-react";
import type { Destination } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/i18n";
import "./groups-compact.css";

type Labels = Record<"eyebrow" | "allAccounts" | "managedBy" | "connected" | "sync" | "syncing" | "search" | "export" | "groups" | "showing" | "allowed" | "restricted" | "members" | "loading" | "empty" | "emptyHint" | "noAccountToast" | "details", string>;
type Props = {
  accounts: { id: string; name: string; status: string }[];
  accountsLoading: boolean;
  accountFilter: string;
  onAccountFilter: (value: string) => void;
  statusFilter: string;
  onStatusFilter: (value: string) => void;
  statusOptions: readonly { value: string; label: string }[];
  query: string;
  onQuery: (value: string) => void;
  scopedRows: Destination[];
  visible: Destination[];
  loading: boolean;
  loadError: boolean;
  onRetry: () => void;
  syncing: boolean;
  onSync: () => void;
  onExport: () => void;
  onSelect: (destination: Destination) => void;
  labels: Labels;
  accountName: (id: string) => string;
  destinationLabel: (destination: Destination) => string;
  destinationKind: (destination: Destination) => string;
};

export function GroupsCompactView(props: Props) {
  const { language, t } = useLanguage();
  const { labels: copy } = props;
  const scopeName = props.accountFilter === "all" ? copy.allAccounts : props.accountName(props.accountFilter);
  const eligibleAccounts = props.accounts.filter(account => account.status === "connected"
    && (props.accountFilter === "all" || account.id === props.accountFilter));
  const permitted = props.scopedRows.filter(item => item.canPost).length;
  const countsReady = !props.loading && !props.loadError;

  return <div className="tc-compact tc-groups-live">
    <div className="tc-compact__heading">
      <div><p className="tc-compact__eyebrow">{t("Sync destinations")}</p><h1>{t("Groups & channels")}</h1></div>
      <span className="tc-compact__connected"><span className="tc-compact__online-dot" />{props.accountsLoading ? "…" : props.accounts.filter(account => account.status === "connected").length} {copy.connected}</span>
    </div>
    <section className="tc-compact__syncbar" aria-label={copy.sync}>
      <label className="tc-compact__scope">
        <span className="tc-compact__scope-label">{t("Account")}</span>
        <span className="tc-compact__select-wrap">
          <select value={props.accountFilter} onChange={event => props.onAccountFilter(event.target.value)} disabled={props.syncing || props.accountsLoading} aria-label={copy.managedBy} data-testid="groups-account-filter">
            <option value="all">{copy.allAccounts}</option>
            {props.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </span>
      </label>
      <button className="tc-compact__sync-button" onClick={props.onSync} disabled={props.syncing || props.accountsLoading || !eligibleAccounts.length} title={!eligibleAccounts.length ? copy.noAccountToast : scopeName} data-testid="groups-sync">
        <RefreshCw size={15} className={props.syncing ? "tc-compact__spin" : ""} /><span>{props.syncing ? copy.syncing : copy.sync}</span>
      </button>
    </section>
    <p className="tc-compact__scope-hint">{copy.managedBy}: <strong>{scopeName}</strong></p>
    <section className="tc-compact__summary" aria-label={t("Posting permissions")}>
      <div><span>{t("total")}</span><strong>{countsReady ? props.scopedRows.length : "—"}</strong></div>
      <div className="tc-compact__summary-good"><span>{copy.allowed}</span><strong>{countsReady ? permitted : "—"}</strong></div>
      <div className="tc-compact__summary-warn"><span>{copy.restricted}</span><strong>{countsReady ? props.scopedRows.length - permitted : "—"}</strong></div>
    </section>
    <section className="tc-compact__list-shell" aria-label={t("Groups")}>
      <div className="tc-compact__filters">
        <label className="tc-compact__search">
          <Search size={16} aria-hidden="true" />
          <input value={props.query} onChange={event => props.onQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} data-testid="groups-search" />
          {props.query && <button type="button" onClick={() => props.onQuery("")} aria-label={t("Reset")}><X size={15} /></button>}
        </label>
        <label className="tc-compact__status-select">
          <select value={props.statusFilter} onChange={event => props.onStatusFilter(event.target.value)} aria-label={t("Posting permission")} data-testid="groups-status-filter">
            {props.statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <button className="tc-compact__export" onClick={props.onExport} disabled={!countsReady} aria-label={copy.export} title={copy.export} data-testid="groups-export"><ArrowDownToLine size={15} /><span>{copy.export}</span></button>
      </div>
      <div className="tc-compact__list-meta">
        <span>{copy.showing} <strong>{countsReady ? props.visible.length : "—"}</strong> / {countsReady ? props.scopedRows.length : "—"} {copy.groups}</span>
        <span>{t("View details")}</span>
      </div>
      <div className="tc-compact__rows">
        {props.loading ? <div className="tc-compact__empty" role="status"><RefreshCw size={22} className="tc-compact__spin" /><p>{copy.loading}</p></div>
          : props.loadError ? <div className="tc-compact__empty" role="alert"><p>{t("Could not load data")}</p><button className="tc-compact__sync-button" onClick={props.onRetry}>{t("Try again")}</button></div>
          : props.visible.length ? props.visible.map(item => <button type="button" className="tc-compact__row" key={item.id} onClick={() => props.onSelect(item)} data-testid={`group-card-${item.id}`} aria-label={`${props.destinationLabel(item)} · ${copy.details}`}>
              <span className={`tc-compact__kind-icon tc-compact__kind-icon--${item.kind}`}>
                {item.kind === "topic" ? <Hash size={16} /> : item.kind === "channel" ? <Send size={15} /> : item.kind === "forum" ? <Layers3 size={16} /> : <Users size={16} />}
              </span>
              <span className="tc-compact__row-copy">
                <span className="tc-compact__row-title" title={props.destinationLabel(item)} dir="auto">{props.destinationLabel(item)}</span>
                <span className="tc-compact__row-sub">
                  <span>{props.destinationKind(item)}</span><i>·</i><span className="tc-compact__account-name">{props.accountName(item.accountId)}</span>
                  {item.kind !== "topic" && item.memberCount != null && <><i>·</i><span>{item.memberCount.toLocaleString(language)} {copy.members}</span></>}
                </span>
              </span>
              <span className={`tc-compact__permission ${item.canPost ? "is-allowed" : "is-restricted"}`}><span className="tc-compact__permission-dot" />{item.canPost ? copy.allowed : copy.restricted}</span>
            </button>)
          : <div className="tc-compact__empty"><Search size={22} /><strong>{copy.empty}</strong><p>{copy.emptyHint}</p></div>}
      </div>
    </section>
  </div>;
}
