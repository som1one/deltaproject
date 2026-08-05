import { redirect } from "next/navigation";

/**
 * /terms живёт в футере и форме регистрации, но канонический документ —
 * публичная оферта. Держим постоянный редирект вместо 404.
 */
export default function TermsPage() {
  redirect("/offer");
}
