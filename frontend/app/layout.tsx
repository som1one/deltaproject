import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "looney moon — сообщество по ворку",
    template: "%s · looney moon",
  },
  description:
    "looney moon — сообщество по ворку: способ быстро находить деньги в интернете. Воркеры приводят заказчиков рекламы и получают процент с каждого их заказа, блогеры выполняют интеграции.",
  applicationName: "looney moon",
  keywords: ["ворк", "заработок в интернете", "реклама у блогеров", "интеграции", "looney moon"],
  authors: [{ name: "looney moon" }],
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "looney moon",
    title: "looney moon — сообщество по ворку",
    description:
      "Способ быстро находить деньги в интернете: приводите заказчиков рекламы и получайте процент с каждого их заказа. Выплаты на карту из кабинета.",
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: "looney moon — сообщество по ворку",
    description: "Способ быстро находить деньги в интернете: приводите заказчиков — процент с их заказов ваш.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Hanken+Grotesk:wght@300;400;500;600;700&family=Manrope:wght@300;400;500;600;700;800&family=Marck+Script&family=Caveat:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
