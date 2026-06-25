const ACCESS_KEY = "delta_access_token";
const REFRESH_KEY = "delta_refresh_token";
const LINKED_TO_KEY = "delta_linked_to";

let accessTokenMemory = "";
let refreshTokenMemory = "";

const safeStorage = () => (typeof window === "undefined" ? null : window.localStorage);
const safeSessionStorage = () => (typeof window === "undefined" ? null : window.sessionStorage);

export const tokenStorage = {
  readAccessToken: () => accessTokenMemory || safeStorage()?.getItem(ACCESS_KEY) || "",
  readRefreshToken: () => refreshTokenMemory || safeStorage()?.getItem(REFRESH_KEY) || "",
  setTokens: (accessToken: string, refreshToken: string) => {
    accessTokenMemory = accessToken;
    refreshTokenMemory = refreshToken;
    safeStorage()?.setItem(ACCESS_KEY, accessToken);
    safeStorage()?.setItem(REFRESH_KEY, refreshToken);
  },
  clear: () => {
    accessTokenMemory = "";
    refreshTokenMemory = "";
    safeStorage()?.removeItem(ACCESS_KEY);
    safeStorage()?.removeItem(REFRESH_KEY);
  },
};

export const telegramStorage = {
  setLinkedTo: (linkedTo: string) => safeSessionStorage()?.setItem(LINKED_TO_KEY, linkedTo),
  getLinkedTo: () => safeSessionStorage()?.getItem(LINKED_TO_KEY) || "",
  clearLinkedTo: () => safeSessionStorage()?.removeItem(LINKED_TO_KEY),
};
