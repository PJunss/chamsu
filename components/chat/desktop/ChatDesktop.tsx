"use client";

import { MessageInput } from "@/components/chat/MessageInput";
import { MessageList, type ChatViewProps } from "@/components/chat/MessageList";
import { RoomList } from "@/components/chat/RoomList";

export function ChatDesktop(p: ChatViewProps) {
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-zinc-200">
        <RoomList items={p.rooms} selected={p.roomId} onSelect={p.selectRoom} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
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
      </section>
    </div>
  );
}
