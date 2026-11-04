import aliases from "./locale-catalogs/aliases.json";
import { isInterfaceLanguage, type InterfaceLanguage } from "./locales";

export type InterfaceCatalog = Readonly<Record<string, string>>;
const loaded = new Map<InterfaceLanguage, InterfaceCatalog>();
const pending = new Map<InterfaceLanguage, Promise<void>>();
const loaders = import.meta.glob("./locale-catalogs/*.json", { import: "default" }) as Record<string, () => Promise<InterfaceCatalog>>;
let activeLanguage: InterfaceLanguage = readStoredInterfaceLanguage();
let anonymousChoice: InterfaceLanguage | null = null;

export function pendingAnonymousInterfaceLanguage(): InterfaceLanguage | null {
  try {
    const stored = typeof window === "undefined" ? null : window.sessionStorage.getItem("telecampaign-pending-language");
    return isInterfaceLanguage(stored) ? stored : anonymousChoice;
  } catch { return anonymousChoice; }
}

export function rememberAnonymousInterfaceLanguage(language: InterfaceLanguage): void {
  anonymousChoice = language;
  try { window.sessionStorage.setItem("telecampaign-pending-language", language); } catch { /* In-memory choice still works. */ }
}

export function clearAnonymousInterfaceLanguage(expected: InterfaceLanguage): void {
  if (pendingAnonymousInterfaceLanguage() !== expected) return;
  anonymousChoice = null;
  try { window.sessionStorage.removeItem("telecampaign-pending-language"); } catch { /* No storage access. */ }
}

export function readStoredInterfaceLanguage(): InterfaceLanguage {
  try {
    const value = typeof window === "undefined" ? null : window.localStorage.getItem("telecampaign-language");
    return isInterfaceLanguage(value) ? value : "vi";
  } catch { return "vi"; }
}

/** Legacy text-only helpers use this; new UI should pass its context language. */
export function activateInterfaceLanguage(language: InterfaceLanguage): void {
  activeLanguage = language;
}

export function isInterfaceCatalogLoaded(language: InterfaceLanguage): boolean {
  return loaded.has(language);
}

export async function loadInterfaceCatalog(language: InterfaceLanguage): Promise<void> {
  if (!isInterfaceLanguage(language)) throw new Error("INVALID_INTERFACE_LANGUAGE");
  if (loaded.has(language)) return;
  if (pending.has(language)) return pending.get(language);
  const loader = loaders[`./locale-catalogs/${language}.json`];
  if (!loader) throw new Error("INTERFACE_CATALOG_UNAVAILABLE");
  const request = loader().then((catalog) => {
    if (!catalog || typeof catalog !== "object") throw new Error("INVALID_INTERFACE_CATALOG");
    loaded.set(language, catalog);
  }).finally(() => { pending.delete(language); });
  pending.set(language, request);
  return request;
}

function canonical(source: string): string {
  let result = source;
  const visited = new Set<string>();
  while (Object.hasOwn(aliases, result) && !visited.has(result)) {
    visited.add(result);
    const next = (aliases as Record<string, string>)[result];
    if (next === result) break;
    result = next;
  }
  return result;
}

function isTechnicalText(value: string): boolean {
  return !/\p{L}/u.test(value)
    || /^(?:https?:\/\/|\/)/u.test(value)
    || /^(?:[A-Z0-9_]+|[a-z]+(?:-[a-z\d]+)+)$/u.test(value)
    || ["vi", "en", "ltr", "rtl"].includes(value);
}

type Pattern = { expression: RegExp; key: string; parameters: string[] };
let patterns: Pattern[] | undefined;
function templatePatterns(): Pattern[] {
  if (patterns) return patterns;
  const candidates = new Set<string>([
    ...Object.keys(aliases),
    ...Object.values(aliases),
    ...Object.keys(loaded.get("en") ?? loaded.values().next().value ?? {}),
  ]);
  patterns = [];
  for (const source of candidates) {
    if (!/\{\{[^{}]+\}\}/u.test(source)) continue;
    const parameters: string[] = [];
    let expression = "", cursor = 0;
    for (const match of source.matchAll(/\{\{([^{}]+)\}\}/gu)) {
      expression += source.slice(cursor, match.index).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&") + "([\\s\\S]*?)";
      parameters.push(match[1]);
      cursor = match.index! + match[0].length;
    }
    expression += source.slice(cursor).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    patterns.push({ expression: new RegExp(`^${expression}$`, "u"), key: canonical(source), parameters });
  }
  // More specific messages precede broad templates such as "{{0}}".
  patterns.sort((left, right) => right.expression.source.length - left.expression.source.length);
  return patterns;
}

export function interfaceText(
  source: string,
  language: InterfaceLanguage = activeLanguage,
  values: Readonly<Record<string, unknown>> = {},
): string {
  const catalog = loaded.get(language);
  if (!catalog) throw new Error("INTERFACE_CATALOG_NOT_READY");
  const leading = source.match(/^\s*/u)?.[0] ?? "";
  const trailing = source.match(/\s*$/u)?.[0] ?? "";
  let key = canonical(source.trim());
  let variables = { ...values };
  if (!Object.hasOwn(catalog, key)) {
    if (isTechnicalText(source.trim())) return source;
    for (const pattern of templatePatterns()) {
      const match = pattern.expression.exec(source.trim());
      if (!match || !Object.hasOwn(catalog, pattern.key)) continue;
      const extracted: Record<string, string> = {};
      let valid = true;
      pattern.parameters.forEach((name, index) => {
        if (Object.hasOwn(extracted, name) && extracted[name] !== match[index + 1]) valid = false;
        extracted[name] = match[index + 1];
      });
      if (!valid) continue;
      key = pattern.key;
      variables = { ...extracted, ...values };
      break;
    }
  }
  if (!Object.hasOwn(catalog, key)) throw new Error("MISSING_INTERFACE_TRANSLATION");
  // Legacy English plural suffixes are implementation details, not content.
  // Standalone time units use Intl for native plurals and numerals.
  const unit = /^\{\{(\d+)\}\} (day|hour|minute|second)\{\{(\d+)\}\}$/u.exec(key);
  if (unit && Number.isFinite(Number(variables[unit[1]]))) {
    return leading + new Intl.NumberFormat(language, { style: "unit", unit: unit[2], unitDisplay: "long" }).format(Number(variables[unit[1]])) + trailing;
  }
  if (language !== "en") {
    for (const match of key.matchAll(/\b(?:day|hour|minute|second|account|campaign|group|message|key)\{\{(\d+)\}\}/gu)) {
      if (!Object.hasOwn(variables, match[1]) || variables[match[1]] === "s") variables[match[1]] = "";
    }
  }
  return leading + catalog[key].replace(/\{\{([^{}]+)\}\}/gu, (placeholder, name: string) => (
    Object.hasOwn(variables, name) ? String(variables[name] ?? "") : placeholder
  )) + trailing;
}

/** Only pass dictionaries owned by the application, never customer content. */
export function interfaceCopy<T extends { en: unknown; vi: unknown }>(copy: T, language: InterfaceLanguage): T["en"] {
  if (copy == null) return undefined as T["en"];
  if (language === "vi") return copy.vi as T["en"];
  function localize(value: unknown): unknown {
    if (typeof value === "string") return interfaceText(value, language);
    if (typeof value === "function") return (...args: unknown[]) => localize(value(...args));
    if (Array.isArray(value)) return value.map(localize);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      // Choice records contain transport values as well as presentation copy.
      // Never translate a filter value, identifier, payload or handler.
      if (Object.prototype.hasOwnProperty.call(record, "value") && Object.prototype.hasOwnProperty.call(record, "label")) {
        const presentation = new Set(["label", "title", "description", "hint", "disabledReason"]);
        return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, presentation.has(key) ? localize(nested) : nested]));
      }
      return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, localize(nested)]));
    }
    return value;
  }
  return localize(copy.en) as T["en"];
}

export function interfacePair(pair: readonly unknown[] | null | undefined, language: InterfaceLanguage = activeLanguage): unknown {
  const value = pair?.[language === "vi" ? 0 : 1];
  return typeof value === "string" ? interfaceText(value, language) : value;
}

/** Only known, application-owned system notifications are passed here. */
export function interfaceSystemNotification(source: string, language: InterfaceLanguage, authoredContent = false): string {
  if (language === "en" || language === "vi") return source;
  try { return interfaceText(source, language); }
  catch (error) {
    if (authoredContent && error instanceof Error && error.message.startsWith("MISSING_INTERFACE_TRANSLATION:")) return source;
    throw error;
  }
}
