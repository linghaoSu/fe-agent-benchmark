/**
 * 尝试按 locale 回落顺序动态导入：完整 locale -> 语言前缀 -> fallback
 * 例如 'zh-TW' -> 'zh-TW' -> 'zh' -> 'en'
 */
export async function importWithLocaleFallback(
  lang: string,
  importFn: (locale: string) => Promise<unknown>,
  { fallback = 'en', lowercase = false }: { fallback?: string; lowercase?: boolean } = {},
): Promise<{ module: unknown; locale: string }> {
  const locale = lowercase ? lang.toLowerCase() : lang;
  const prefix = locale.split('-')[0];
  const candidates = [...new Set([locale, prefix, fallback])];

  // eslint-disable-next-line no-restricted-syntax
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await importFn(candidate);

      return {
        module: mod,
        locale: candidate,
      };
    } catch (e) {
      console.warn(`[locale] Failed to load "${candidate}", trying next`, e);
    }
  }

  return {
    module: null,
    locale: fallback,
  };
}
