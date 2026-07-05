import { redirect } from "next/navigation";

/** Лендинг переехал на корень поддомена. */
export default function LegacyHomeRedirect() {
  redirect("/");
}
