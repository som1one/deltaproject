const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const appConfig = {
  apiBaseUrl: required(process.env.NEXT_PUBLIC_API_BASE_URL, "NEXT_PUBLIC_API_BASE_URL"),
  appUrl: required(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL"),
  mainAppUrl: process.env.NEXT_PUBLIC_MAIN_APP_URL ?? "",
};
