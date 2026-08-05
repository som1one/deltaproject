import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";
import { themeInitScript } from "@/components/shell/theme-toggle";
import { SITE_URL } from "@/lib/config";

import "./globals.css";

const SITE_NAME = "Looney Moon Market";
const SITE_TITLE = "Looney Moon Market — реклама у блогеров без риска";
const SITE_DESCRIPTION =
  "Маркетплейс рекламы у блогеров платформы moneymaxxxing: эскроу-сделки, проверенные авторы. Оплата удерживается платформой до подтверждения публикации.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

// Яндекс.Метрика: включается только при заданном NEXT_PUBLIC_METRIKA_ID,
// вебвизор отключён сознательно — на площадке есть переписка по сделкам.
const METRIKA_ID = process.env.NEXT_PUBLIC_METRIKA_ID;

const metrikaScript = METRIKA_ID
  ? `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
ym(${JSON.stringify(METRIKA_ID)}, "init", {clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false});`
  : null;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Manrope:wght@300;400;500;600;700;800&family=Caveat:wght@400;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {metrikaScript && <script dangerouslySetInnerHTML={{ __html: metrikaScript }} />}
      </head>
      <body>
        {METRIKA_ID && (
          <noscript>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
                style={{ position: "absolute", left: "-9999px" }}
                alt=""
              />
            </div>
          </noscript>
        )}
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
