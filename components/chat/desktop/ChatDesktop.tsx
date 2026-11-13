"use client";

import { BotAvatar } from "@/components/chat/BotAvatar";
import { MessageInput } from "@/components/chat/MessageInput";
import { AffinityBadge, MessageList, type ChatViewProps } from "@/components/chat/MessageList";

export function ChatDesktop(p: ChatViewProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4">
        <BotAvatar src={p.avatar} alt={p.roomTitle} />
        <h1 className="flex min-w-0 items-center gap-2 text-base font-bold">
          <span className="truncate">{p.roomTitle}</span>
          {p.titleAffinity !== null && <AffinityBadge score={p.titleAffinity} />}
        </h1>
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
