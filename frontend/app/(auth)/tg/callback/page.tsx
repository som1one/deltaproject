import { Suspense } from "react";

import { TelegramCallback } from "@/components/auth/telegram-callback";

export default function TelegramCallbackPage() {
  return (
    <Suspense>
      <TelegramCallback />
    </Suspense>
  );
}
