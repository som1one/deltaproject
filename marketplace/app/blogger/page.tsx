import { redirect } from "next/navigation";

/**
 * «Входящие» переехали: сделки автора живут в общем реестре /orders,
 * управление карточкой и профилем — в /cabinet. Отдельная страница
 * дублировала оба раздела и была удалена.
 */
export default function LegacyBloggerRedirect() {
  redirect("/orders");
}
