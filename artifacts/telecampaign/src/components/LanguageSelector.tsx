import { useEffect, useId, useRef, useState } from "react";
import { interfaceText } from "@/lib/interface-runtime";
import { Check, ChevronDown, Search } from "lucide-react";
import {
  getInterfaceLocale,
  interfaceLocales,
  searchInterfaceLocales,
  type InterfaceLanguage,
} from "@/lib/locales";

type SelectorCopy = { label: string; search: string; empty: string };
const copy: Record<InterfaceLanguage, SelectorCopy> = {
  vi: { label: "Ngôn ngữ", search: "Tìm ngôn ngữ hoặc quốc gia…", empty: "Không tìm thấy ngôn ngữ." },
  en: { label: "Language", search: "Search language or country…", empty: "No languages found." },
  lo: { label: "ພາສາ", search: "ຄົ້ນຫາພາສາ ຫຼື ປະເທດ…", empty: "ບໍ່ພົບພາສາ." },
  ms: { label: "Bahasa", search: "Cari bahasa atau negara…", empty: "Tiada bahasa ditemukan." },
  ja: { label: "言語", search: "言語または国を検索…", empty: "言語が見つかりません。" },
  th: { label: "ภาษา", search: "ค้นหาภาษาหรือประเทศ…", empty: "ไม่พบภาษา" },
  ko: { label: "언어", search: "언어 또는 국가 검색…", empty: "언어를 찾을 수 없습니다." },
  "zh-Hans": { label: "语言", search: "搜索语言或国家…", empty: "未找到语言。" },
  "zh-Hant": { label: "語言", search: "搜尋語言或國家…", empty: "找不到語言。" },
  ru: { label: "Язык", search: "Поиск языка или страны…", empty: "Языки не найдены." },
  hi: { label: "भाषा", search: "भाषा या देश खोजें…", empty: "कोई भाषा नहीं मिली।" },
  ar: { label: "اللغة", search: "ابحث عن لغة أو دولة…", empty: "لم يتم العثور على لغة." },
  fil: { label: "Wika", search: "Maghanap ng wika o bansa…", empty: "Walang nakitang wika." },
  de: { label: "Sprache", search: "Sprache oder Land suchen…", empty: "Keine Sprache gefunden." },
  my: { label: "ဘာသာစကား", search: "ဘာသာစကား သို့မဟုတ် နိုင်ငံ ရှာရန်…", empty: "ဘာသာစကား မတွေ့ပါ။" },
  ur: { label: "زبان", search: "زبان یا ملک تلاش کریں…", empty: "کوئی زبان نہیں ملی۔" },
  si: { label: "භාෂාව", search: "භාෂාව හෝ රට සොයන්න…", empty: "භාෂාවක් හමු නොවීය." },
  id: { label: "Bahasa", search: "Cari bahasa atau negara…", empty: "Bahasa tidak ditemukan." },
  nl: { label: "Taal", search: "Zoek een taal of land…", empty: "Geen talen gevonden." },
  sr: { label: "Језик", search: "Претражите језик или земљу…", empty: "Ниједан језик није пронађен." },
  hy: { label: "Լեզու", search: "Որոնել լեզու կամ երկիր…", empty: "Լեզու չի գտնվել։" },
  bn: { label: "ভাষা", search: "ভাষা বা দেশ খুঁজুন…", empty: "কোনো ভাষা পাওয়া যায়নি।" },
};

export function LanguageSelector({
  language, onChange, disabled = false, placement = "bottom", compact = false,
}: {
  language: InterfaceLanguage;
  onChange: (language: InterfaceLanguage) => void;
  disabled?: boolean;
  placement?: "top" | "bottom";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const instanceId = useId();
  const listId = `${instanceId}-languages`;
  const selected = getInterfaceLocale(language);
  const text = copy[language];
  const localizedNames = Object.fromEntries(interfaceLocales.map((locale) => [locale.code, interfaceText(locale.english, language)])) as Record<InterfaceLanguage, string>;
  const results = searchInterfaceLocales(query, localizedNames);

  const close = (returnFocus = false) => {
    setOpen(false);
    setQuery("");
    setActive(0);
    if (returnFocus) trigger.current?.focus();
  };
  const choose = (code: InterfaceLanguage) => {
    onChange(code);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>(`[data-locale-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  useEffect(() => { if (disabled) close(); }, [disabled]);

  return (
    <div ref={root} className="relative w-full" dir="ltr" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <button
        ref={trigger} type="button" disabled={disabled}
        aria-label={text.label} aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? `${instanceId}-dialog` : undefined}
        onClick={() => { if (open) close(); else { setQuery(""); setActive(0); setOpen(true); } }}
        className={`flex w-full min-h-10 items-center justify-between gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-sm font-semibold text-[#334155] shadow-sm transition-colors hover:border-[#a5b4fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] disabled:cursor-wait disabled:opacity-60 ${compact ? "max-w-[180px]" : ""}`}
        data-testid="language-selector"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true">{selected.flag}</span>
          <bdi className="truncate" lang={language}>{selected.native}</bdi>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={`${instanceId}-dialog`} role="dialog" aria-label={text.label}
          className={`absolute right-0 z-[100] w-[min(19rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.16)] ${placement === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
          }}
        >
          <div className="flex items-center gap-2 border-b border-[#eef2f6] px-3 py-3">
            <Search className="h-4 w-4 shrink-0 text-[#94a3b8]" aria-hidden="true" />
            <input
              ref={input} role="combobox" type="search" autoComplete="off" dir="auto"
              aria-label={text.search} aria-controls={listId} aria-expanded="true" aria-autocomplete="list"
              aria-activedescendant={results.length ? `${instanceId}-option-${active}` : undefined}
              value={query} placeholder={text.search}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#334155] outline-none placeholder:text-[#94a3b8]"
              onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => results.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
                } else if (event.key === "Home" && event.ctrlKey) {
                  event.preventDefault(); setActive(0);
                } else if (event.key === "End" && event.ctrlKey) {
                  event.preventDefault(); setActive(Math.max(0, results.length - 1));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  if (results[active]) choose(results[active].code);
                }
              }}
            />
          </div>
          <div id={listId} role="listbox" aria-label={text.label}
            className="max-h-[min(20rem,45dvh)] overflow-y-auto overscroll-contain p-1.5">
            {results.map((locale, index) => (
              <button
                key={locale.code} id={`${instanceId}-option-${index}`}
                data-locale-index={index} type="button" role="option"
                aria-selected={locale.code === language} tabIndex={-1}
                onPointerMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(locale.code)}
                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${locale.code === language ? "bg-[#eef2ff] font-bold text-[#4338ca]" : active === index ? "bg-[#f1f5f9] text-[#0f172a]" : "text-[#334155] hover:bg-[#f8fafc]"}`}
              >
                <span aria-hidden="true" className="shrink-0">{locale.flag}</span>
                <bdi className="min-w-0 flex-1 whitespace-normal break-words" lang={locale.code}>{locale.native}</bdi>
                {locale.code === language && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            ))}
            {!results.length && <p role="status" dir="auto" className="px-3 py-5 text-center text-sm text-[#64748b]">{text.empty}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
