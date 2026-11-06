import type { CSSProperties } from "react";
import { Eye, FileText, Forward, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
import type { MessageTemplate } from "@workspace/api-client-react";
import { useLanguage } from "@/lib/i18n";

export type TemplateFilter = "all" | "text" | "forward";
type Labels = {
  title: string; eyebrow: string; subtitle: string; searchPlaceholder: string; add: string;
  emptySearchTitle: string; emptySearchDetail: string; emptyTitle: string; emptyDetail: string;
  savedMsgLoading: string;
  ariaView: (name: string) => string; ariaEdit: (name: string) => string; ariaDelete: (name: string) => string;
};
type Props = {
  allTemplates: MessageTemplate[]; rows: MessageTemplate[];
  query: string; onQuery: (value: string) => void;
  filter: TemplateFilter; onFilter: (value: TemplateFilter) => void;
  loading: boolean; error: boolean; deleting: boolean; onRetry: () => void;
  onPreview: (template: MessageTemplate) => void; onEdit: (template: MessageTemplate) => void;
  onDelete: (template: MessageTemplate) => void; onCreate: () => void;
  labels: Labels;
};

export function TemplatesLibraryView(props: Props) {
  const { t, language } = useLanguage();
  const { labels } = props;
  const counts = {
    all: props.allTemplates.length,
    text: props.allTemplates.filter(item => item.mode === "text").length,
    forward: props.allTemplates.filter(item => item.mode === "forward").length,
  };
  const countsReady = !props.loading && !props.error;
  return <main className="tcp-main">
    <section className="tcp-intro">
      <div className="tcp-kicker"><span className="tcp-kicker-line" />{labels.eyebrow}</div>
      <div className="tcp-heading-row">
        <div><h1>{labels.title}</h1><p>{labels.subtitle}</p></div>
        <div className="tcp-total" aria-label={labels.title}>
          <strong>{countsReady ? counts.all.toLocaleString(language, { minimumIntegerDigits: 2, useGrouping: true }) : "—"}</strong>
          <span>{t("templates")}</span>
        </div>
      </div>
    </section>
    <section className="tcp-library" aria-label={labels.title}>
      <div className="tcp-search-wrap">
        <Search size={17} aria-hidden="true" />
        <input aria-label={labels.searchPlaceholder} value={props.query}
          onChange={event => props.onQuery(event.target.value)}
          placeholder={labels.searchPlaceholder} data-testid="templates-search" />
        {props.query && <button className="tcp-clear-search" type="button" onClick={() => props.onQuery("")}
          aria-label={t("Reset")}><X size={15} /></button>}
      </div>
      <div className="tcp-filters" role="group" aria-label={t("Type")}>
        {([
          ["all", t("All")],
          ["text", t("Text")],
          ["forward", t("Saved Messages")],
        ] as const).map(([key, label]) => <button type="button" key={key}
          aria-pressed={props.filter === key} className={`tcp-filter ${props.filter === key ? "is-active" : ""}`}
          onClick={() => props.onFilter(key)} data-testid={`templates-filter-${key}`}>
          {label}<span>{countsReady ? counts[key].toLocaleString(language) : "—"}</span>
        </button>)}
      </div>
      {props.loading ? <div className="tcp-skeletons" role="status" aria-label={labels.savedMsgLoading}>
        {[1, 2, 3].map(item => <div className="tcp-skeleton" key={item}><i /><span /><b /></div>)}
      </div> : props.error ? <div className="tcp-empty" role="alert">
        <span className="tcp-empty-icon"><RefreshCw size={19} /></span>
        <strong>{t("Could not load data")}</strong>
        <button type="button" onClick={props.onRetry}><RefreshCw size={14} />{t("Try again")}</button>
      </div> : props.rows.length ? <div className="tcp-list">
        {props.rows.map((item, index) => <article className="tcp-template" key={item.id}
          data-testid={`template-row-${item.id}`} style={{ "--row-index": Math.min(index, 8) } as CSSProperties}>
          <div className={`tcp-type-icon ${item.mode === "forward" ? "is-forward" : "is-text"}`} aria-hidden="true">
            {item.mode === "forward" ? <Forward size={17} /> : <FileText size={17} />}
          </div>
          <div className="tcp-template-info">
            <div className="tcp-name-line">
              <h2 title={item.name}>{item.name}</h2>
              <span className={`tcp-type-label ${item.mode === "forward" ? "is-forward" : "is-text"}`}>
                {item.mode === "forward" ? t("Saved Messages") : t("Text")}
              </span>
            </div>
            <p>{item.content || (item.mode === "forward" ? t("Saved Messages") : "—")}</p>
          </div>
          <div className="tcp-actions">
            <button type="button" className="tcp-action tcp-preview-action" onClick={() => props.onPreview(item)}
              aria-label={labels.ariaView(item.name)} title={labels.ariaView(item.name)}><Eye size={18} /></button>
            <button type="button" className="tcp-action" onClick={() => props.onEdit(item)}
              aria-label={labels.ariaEdit(item.name)} title={labels.ariaEdit(item.name)}><Pencil size={16} /></button>
            <button type="button" className="tcp-action tcp-delete-action" onClick={() => props.onDelete(item)}
              disabled={props.deleting} aria-label={labels.ariaDelete(item.name)} title={labels.ariaDelete(item.name)}><Trash2 size={16} /></button>
          </div>
        </article>)}
      </div> : <div className="tcp-empty">
        <span className="tcp-empty-icon"><FileText size={20} /></span>
        <strong>{props.query || props.filter !== "all" ? labels.emptySearchTitle : labels.emptyTitle}</strong>
        <p>{props.query || props.filter !== "all" ? labels.emptySearchDetail : labels.emptyDetail}</p>
        {props.query || props.filter !== "all"
          ? <button type="button" onClick={() => { props.onQuery(""); props.onFilter("all"); }}>{t("Reset")}</button>
          : <button type="button" onClick={props.onCreate}>{labels.add}</button>}
      </div>}
    </section>
  </main>;
}
