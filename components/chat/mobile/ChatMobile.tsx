"use client";

import { useState } from "react";
import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList, type ChatViewProps } from "@/components/chat/MessageList";
import { PresenceList } from "@/components/chat/PresenceList";
import { RoomList } from "@/components/chat/RoomList";

export function ChatMobile(p: ChatViewProps) {
  const [open, setOpen] = useState(false);

  if (p.showList) {
    return (
      <div className="h-full overflow-y-auto">
        <RoomList items={p.rooms} selected={null} onSelect={p.selectRoom} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 px-4 py-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={p.backToList} className="text-sm text-zinc-500">
            ‹ 목록
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{p.roomTitle}</h1>
          {p.isGroup && (
            <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-zinc-500">
              접속 {p.online.length}명 {open ? "▲" : "▼"}
            </button>
          )}
        </div>
        {p.isGroup && open && (
          <div className="pt-2">
            <PresenceList online={p.online} me={p.me} />
          </div>
        )}
      </header>
      <MessageList
        key={p.roomId}
        me={p.me}
        messages={p.messages}
        hasOlder={p.hasOlder}
        loadOlder={p.loadOlder}
        typing={p.typing}
      />
      <MessageInput
        key={p.roomId}
        send={p.send}
        offline={p.offline}
        claudeFailed={p.claudeFailed}
        placeholder={p.placeholder}
      />
    </div>
  );
}
