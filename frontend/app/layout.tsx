import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Manrope, Cormorant_Garamond, Marck_Script, Caveat } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

/**
 * Marck Script — formal calligraphic script with full Cyrillic support.
 * Closest equivalent to Great Vibes for Russian text.
 */
const marckScript = Marck_Script({
  subsets: ["latin", "cyrillic"],
  weight: ["400"],
  variable: "--font-marck",
  display: "swap",
});

/**
 * Caveat — secondary handwritten font, used for casual UI accents
 * (role-card scripts, 404 pages).
 */
const caveat = Caveat({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

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
    description:
      "Блогеры получают интеграции, работники закрывают сделки, платформа считает выплаты.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${cormorant.variable} ${marckScript.variable} ${caveat.variable}`}
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
