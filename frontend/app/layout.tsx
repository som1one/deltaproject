import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "looney moon — агентство рекламы у блогеров",
    template: "%s · looney moon",
  },
  description:
    "looney moon — платформа, где блогеры получают рекламные интеграции, а работники закрывают сделки. Прозрачные сделки, точные расчёты, выплаты в одном кабинете.",
  applicationName: "looney moon",
  keywords: ["реклама у блогеров", "интеграции", "маркетплейсы", "агентство", "looney moon"],
  authors: [{ name: "looney moon" }],
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "looney moon",
    title: "looney moon — агентство рекламы у блогеров",
    description:
      "Блогеры получают интеграции, работники закрывают сделки, платформа считает выплаты. Всё в одном кабинете.",
    locale: "ru_RU",
  },
  twitter: {
    card: "summary_large_image",
    title: "looney moon — агентство рекламы у блогеров",
    description: "Блогеры получают интеграции, работники закрывают сделки, платформа считает выплаты.",
  },
  robots: { index: true, follow: true },
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
