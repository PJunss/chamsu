"use client";

import Link from "next/link";
import { BotAvatar } from "@/components/chat/BotAvatar";
import { MessageInput } from "@/components/chat/MessageInput";
import { AffinityBadge, MessageList, type ChatViewProps } from "@/components/chat/MessageList";

export function ChatMobile(p: ChatViewProps) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3">
        <Link href="/chat" aria-label="채팅방 목록으로" className="px-1 text-2xl leading-none text-zinc-500">
          ‹
        </Link>
        <BotAvatar src={p.avatar} alt={p.roomTitle} />
        <h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-base font-bold">
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
        quota={p.quota}
        placeholder={p.placeholder}
      />
    </div>
  );
}
