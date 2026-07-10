import { redirect } from "next/navigation";

// Старый партнёрский кабинет маркетплейса упразднён — рабочий кабинет
// воркера живёт в /cabinet.
export default function WorkerMarketplacePage() {
  redirect("/cabinet");
}
