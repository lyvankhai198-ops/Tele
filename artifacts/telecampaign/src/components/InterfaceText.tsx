import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import { interfaceText } from "@/lib/interface-runtime";

/** Returns text only; no extra DOM node or layout change. */
export function InterfaceText({ source, values = {} }: { source: string; values?: Record<string, unknown> }) {
  const { language } = useLanguage();
  return interfaceText(source, language, values);
}

/** Localizes only explicitly marked, static accessibility/presentation props. */
export function InterfaceAttributes({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const child = Children.only(children);
  if (!isValidElement(child)) return child;
  const element = child as ReactElement<Record<string, unknown>>;
  const translated: Record<string, unknown> = {};
  for (const key of ["title", "placeholder", "alt", "aria-label"]) {
    const value = element.props[key];
    if (typeof value === "string" && value.trim()) translated[key] = interfaceText(value, language);
  }
  return cloneElement(element, translated);
}
