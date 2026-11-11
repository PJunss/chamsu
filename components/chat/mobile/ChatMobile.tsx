"use client";

import { useState } from "react";
import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList, type ChatViewProps } from "@/components/chat/MessageList";
import { PresenceList } from "@/components/chat/PresenceList";

export function ChatMobile(p: ChatViewProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 px-4 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-zinc-500">
          접속 {p.online.length}명 {open ? "▲" : "▼"}
        </button>
        {open && (
          <div className="pt-2">
            <PresenceList online={p.online} me={p.me} />
          </div>
        )}
      </header>
      <MessageList me={p.me} messages={p.messages} hasOlder={p.hasOlder} loadOlder={p.loadOlder} />
      <MessageInput send={p.send} />
    </div>
  );
}
