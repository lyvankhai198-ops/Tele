/** Interface locales. Native labels are intentional and must not be translated. */
export const interfaceLocales = [
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese", country: "Vietnam Việt Nam", flag: "🇻🇳", direction: "ltr" },
  { code: "en", native: "English", english: "English", country: "United Kingdom United States Anh Mỹ", flag: "🇬🇧", direction: "ltr" },
  { code: "lo", native: "ລາວ", english: "Lao", country: "Laos Lào", flag: "🇱🇦", direction: "ltr" },
  { code: "ms", native: "Bahasa Melayu", english: "Malay", country: "Malaysia Mã Lai", flag: "🇲🇾", direction: "ltr" },
  { code: "ja", native: "日本語", english: "Japanese", country: "Japan Nhật Bản", flag: "🇯🇵", direction: "ltr" },
  { code: "th", native: "ไทย", english: "Thai", country: "Thailand Thái Lan", flag: "🇹🇭", direction: "ltr" },
  { code: "ko", native: "한국어", english: "Korean", country: "South Korea Hàn Quốc", flag: "🇰🇷", direction: "ltr" },
  { code: "zh-Hans", native: "中文（简体）", english: "Simplified Chinese", country: "China Trung Quốc giản thể", flag: "🇨🇳", direction: "ltr" },
  { code: "zh-Hant", native: "中文（繁體）", english: "Traditional Chinese", country: "Taiwan Hong Kong Trung phồn thể", flag: "🇹🇼", direction: "ltr" },
  { code: "ru", native: "Русский", english: "Russian", country: "Russia Nga", flag: "🇷🇺", direction: "ltr" },
  { code: "hi", native: "हिन्दी", english: "Hindi", country: "India Ấn Độ", flag: "🇮🇳", direction: "ltr" },
  { code: "ar", native: "العربية", english: "Arabic", country: "Saudi Arabia Ả Rập", flag: "🇸🇦", direction: "rtl" },
  { code: "fil", native: "Filipino", english: "Filipino", country: "Philippines", flag: "🇵🇭", direction: "ltr" },
  { code: "de", native: "Deutsch", english: "German", country: "Germany Đức", flag: "🇩🇪", direction: "ltr" },
  { code: "my", native: "မြန်မာ", english: "Burmese", country: "Myanmar Miến Điện", flag: "🇲🇲", direction: "ltr" },
  { code: "ur", native: "اردو", english: "Urdu", country: "Pakistan Pa ki xtan", flag: "🇵🇰", direction: "rtl" },
  { code: "si", native: "සිංහල", english: "Sinhala", country: "Sri Lanka", flag: "🇱🇰", direction: "ltr" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", country: "Indonesia Nam Dương", flag: "🇮🇩", direction: "ltr" },
  { code: "nl", native: "Nederlands", english: "Dutch", country: "Netherlands Hà Lan", flag: "🇳🇱", direction: "ltr" },
  { code: "sr", native: "Српски", english: "Serbian", country: "Serbia", flag: "🇷🇸", direction: "ltr" },
  { code: "hy", native: "Հայերեն", english: "Armenian", country: "Armenia", flag: "🇦🇲", direction: "ltr" },
  { code: "bn", native: "বাংলা", english: "Bengali", country: "Bangladesh Bangla Băng la đét", flag: "🇧🇩", direction: "ltr" },
] as const;

export type InterfaceLanguage = typeof interfaceLocales[number]["code"];
export type InterfaceLocale = typeof interfaceLocales[number];

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return typeof value === "string" && interfaceLocales.some((locale) => locale.code === value);
}

export function getInterfaceLocale(value: InterfaceLanguage): InterfaceLocale {
  return interfaceLocales.find((locale) => locale.code === value)!;
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/đ/giu, "d").toLowerCase().trim();
}

/** Search native names, English names, country names and BCP-47 codes. */
export function searchInterfaceLocales(query: string, localizedNames: Partial<Record<InterfaceLanguage, string>> = {}): readonly InterfaceLocale[] {
  const tokens = normalizeSearch(query).split(/\s+/u).filter(Boolean);
  return interfaceLocales.filter((locale) => {
    const haystack = normalizeSearch(`${locale.code} ${locale.native} ${locale.english} ${locale.country} ${localizedNames[locale.code] ?? ""}`);
    return tokens.every((token) => haystack.includes(token));
  });
}
