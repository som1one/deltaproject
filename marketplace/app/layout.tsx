import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Looney Moon Market — реестр рекламных размещений у блогеров",
    template: "%s · Looney Moon Market",
  },
  description:
    "Кураторский реестр рекламных интеграций: ручной отбор авторов, безопасная сделка, оплата удерживается платформой до подтверждения публикации.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Prata&family=Cormorant+Garamond:ital,wght@1,500;1,600&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
