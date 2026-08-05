import type { Metadata } from "next";
import type { ReactNode } from "react";

// Страница каталога — клиентская, поэтому metadata живёт в серверном layout.
export const metadata: Metadata = {
  title: "Каталог авторов",
  description:
    "Проверенные блогеры для рекламных интеграций: фильтры по нише, охвату и цене. Деньги на счёте платформы до подтверждения публикации.",
};

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return children;
}
