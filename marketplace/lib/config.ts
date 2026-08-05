const required = (value: string | undefined, name: string) => {
  if (!value) {
    // During build/prerender, env vars may not be available — use placeholder
    if (typeof window === "undefined" && process.env.NODE_ENV === "production") {
      return `__${name}__`;
    }
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const appConfig = {
  apiBaseUrl: required(process.env.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL"),
  appUrl: required(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL"),
  mainAppUrl: process.env.NEXT_PUBLIC_MAIN_APP_URL ?? "https://moneymaxxxing.ru",
};

/** Канонический публичный адрес маркетплейса — для metadata, robots и sitemap. */
export const SITE_URL = "https://marketplace.moneymaxxxing.ru";

/**
 * Абсолютный URL API для серверного контекста (generateMetadata, sitemap).
 * Читаем env напрямую: NEXT_PUBLIC_* инлайнится только в клиентский бандл,
 * а на сервере значение доступно в рантайме. Если переменная не задана или
 * не абсолютная — возвращаем null, вызывающий код падает в фолбэк.
 */
export const serverApiBaseUrl = (): string | null => {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  return url.startsWith("http") ? url.replace(/\/$/, "") : null;
};

/**
 * Загруженные изображения хранятся на бэкенде и отдаются по /uploads/...
 * Относительные ссылки из API дополняем до абсолютных.
 */
export const resolveUploadUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (url.startsWith("/uploads/")) return `${appConfig.apiBaseUrl}${url}`;
  return url;
};
