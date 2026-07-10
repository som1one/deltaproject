"use client";

import { useParams } from "next/navigation";

import { ChatsShell } from "@/components/chat/chats-shell";
import { Conversation } from "@/components/chat/conversation";

/**
 * /chats/[partnerId] — переписка с собеседником. Работает и без истории:
 * пустая лента + композер, партнёр резолвится из getConversation.partner.
 */
export default function ChatPage() {
  const params = useParams<{ partnerId: string }>();
  const partnerId = params.partnerId;

  return (
    <ChatsShell activePartnerId={partnerId}>
      <Conversation key={partnerId} partnerId={partnerId} />
    </ChatsShell>
  );
}
