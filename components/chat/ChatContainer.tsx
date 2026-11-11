"use client";

import { useCallback } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { useMessages } from "@/components/chat/useMessages";
import { usePresence } from "@/components/chat/usePresence";
import { ConnectionBanner } from "@/components/chat/ConnectionBanner";
import { ChatDesktop } from "@/components/chat/desktop/ChatDesktop";
import { ChatMobile } from "@/components/chat/mobile/ChatMobile";
import type { ChatViewProps } from "@/components/chat/MessageList";

export function ChatContainer({ uid, nickname }: { uid: string; nickname: string }) {
  const { messages, loadOlder, hasOlder, offline } = useMessages();
  const online = usePresence(uid, nickname);

  const send = useCallback(
    async (text: string) => {
      try {
        await addDoc(collection(getClientDb(), "messages"), {
          text, nickname, uid, createdAt: serverTimestamp(),
        });
        return true;
      } catch {
        return false;
      }
    },
    [uid, nickname],
  );

  const props: ChatViewProps = { me: uid, messages, online, hasOlder, offline, loadOlder, send };

  return (
    <main className="flex h-dvh flex-col bg-white">
      <ConnectionBanner offline={offline} />
      <div className="min-h-0 flex-1 md:hidden">
        <ChatMobile {...props} />
      </div>
      <div className="hidden min-h-0 flex-1 md:block">
        <ChatDesktop {...props} />
      </div>
    </main>
  );
}
