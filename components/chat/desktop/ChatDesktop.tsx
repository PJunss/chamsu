"use client";

import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList, type ChatViewProps } from "@/components/chat/MessageList";
import { PresenceList } from "@/components/chat/PresenceList";

export function ChatDesktop(p: ChatViewProps) {
  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <MessageList me={p.me} messages={p.messages} hasOlder={p.hasOlder} loadOlder={p.loadOlder} />
        <MessageInput send={p.send} />
      </section>
      <aside className="w-56 border-l border-zinc-200 p-4">
        <h2 className="mb-3 text-xs font-semibold text-zinc-500">접속 {p.online.length}명</h2>
        <PresenceList online={p.online} me={p.me} />
      </aside>
    </div>
  );
}
