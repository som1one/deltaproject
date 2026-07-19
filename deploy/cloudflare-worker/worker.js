/**
 * Cloudflare Worker — reverse proxy для Telegram с российских серверов.
 * Обходит блокировку РКН: OAuth (oauth.telegram.org) и Bot API (api.telegram.org).
 *
 * Маршрутизация по пути:
 *   /bot<token>/…  и  /file/bot<token>/…  →  https://api.telegram.org
 *   всё остальное (OAuth, JWKS)           →  https://oauth.telegram.org
 *
 * Без маршрутизации Bot API-вызовы (getChatMember — проверка подписки на канал)
 * уходили на oauth-хост, получали 302 без JSON и валили проверку для всех.
 *
 * Деплой:
 *   1. Зайди на https://dash.cloudflare.com → Workers & Pages → Create
 *   2. Назови worker (напр. "tg-oauth-proxy")
 *   3. Вставь этот код в редактор → Deploy
 *   4. Запиши URL вида: https://tg-oauth-proxy.<your-subdomain>.workers.dev
 *   5. Пропиши в .env на сервере:
 *        TELEGRAM_OAUTH_ISSUER=https://tg-oauth-proxy.<your-subdomain>.workers.dev
 *        TELEGRAM_OAUTH_JWKS_URL=https://tg-oauth-proxy.<your-subdomain>.workers.dev/.well-known/jwks.json
 *        TELEGRAM_OAUTH_PROXY=https://tg-oauth-proxy.<your-subdomain>.workers.dev
 *      (TELEGRAM_OAUTH_PROXY нужен, чтобы проверка подписки на канал ходила
 *       в Bot API через worker, а не напрямую в заблокированный api.telegram.org.)
 *
 * Секрет AUTH_SECRET (опционально) — если задан в Worker Environment Variables,
 * то worker проверяет заголовок X-Proxy-Secret (TELEGRAM_OAUTH_PROXY_SECRET в .env).
 */

const OAUTH_TARGET = "https://oauth.telegram.org";
const BOT_API_TARGET = "https://api.telegram.org";

// /bot123456:ABC…/method и /file/bot123456:ABC…/path — это Bot API
const BOT_API_PATH = /^\/(?:file\/)?bot\d+:/;

export default {
  async fetch(request, env) {
    // Опциональная защита: только наш бэкенд может использовать proxy
    if (env.AUTH_SECRET) {
      const secret = request.headers.get("X-Proxy-Secret");
      if (secret !== env.AUTH_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const url = new URL(request.url);
    const target = BOT_API_PATH.test(url.pathname) ? BOT_API_TARGET : OAUTH_TARGET;
    const targetUrl = target + url.pathname + url.search;

    // Копируем заголовки, убирая CF-специфичные
    const headers = new Headers(request.headers);
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ray");
    headers.delete("cf-visitor");
    headers.delete("cf-worker");
    headers.delete("x-proxy-secret");
    headers.set("Host", new URL(target).host);

    const init = {
      method: request.method,
      headers,
    };

    // Пробрасываем body для POST/PUT/PATCH
    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      init.body = request.body;
      init.duplex = "half";
    }

    try {
      const response = await fetch(targetUrl, init);

      // Копируем response headers, убирая hop-by-hop
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("transfer-encoding");
      responseHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, { status: 502 });
    }
  },
};
