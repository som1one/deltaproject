import { redirect } from "next/navigation";

// Email-логин воркера убран. Worker логинится только через Telegram на /register.
export default function WorkerLoginPage() {
  redirect("/register");
}
