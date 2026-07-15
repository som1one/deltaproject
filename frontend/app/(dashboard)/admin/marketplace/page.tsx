import { redirect } from "next/navigation";

// Управление маркетплейсом переехало в основную админку (раздел «Маркетплейс»).
export default function AdminMarketplaceRedirect() {
  redirect("/admin?section=mp-dashboard");
}
