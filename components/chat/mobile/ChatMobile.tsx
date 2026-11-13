"use client";

import { MessageInput } from "@/components/chat/MessageInput";
import { AffinityBadge, MessageList, type ChatViewProps } from "@/components/chat/MessageList";
import { RoomList } from "@/components/chat/RoomList";

export function ChatMobile(p: ChatViewProps) {
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
          <h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{p.roomTitle}</span>
            {p.titleAffinity !== null && <AffinityBadge score={p.titleAffinity} />}
          </h1>
        </div>
      </header>
      <MessageList
        key={`list-${p.roomId}`}
        me={p.me}
        messages={p.messages}
        hasOlder={p.hasOlder}
        loadOlder={p.loadOlder}
        typing={p.typing}
        affinity={p.affinity}
      />
      <MessageInput
        key={`input-${p.roomId}`}
        send={p.send}
        offline={p.offline}
        claudeFailed={p.claudeFailed}
        placeholder={p.placeholder}
      />
    </div>
  );
}
