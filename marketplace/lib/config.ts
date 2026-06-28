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
  mainAppUrl: process.env.NEXT_PUBLIC_MAIN_APP_URL ?? "https://looneymoon.com",
};
