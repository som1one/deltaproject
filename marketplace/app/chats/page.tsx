"use client";

import { ChatPlaceholder, ChatsShell } from "@/components/chat/chats-shell";

/** /chats — список диалогов; на десктопе справа плейсхолдер. */
export default function ChatsPage() {
  return (
    <ChatsShell>
      <ChatPlaceholder />
    </ChatsShell>
  );
}
