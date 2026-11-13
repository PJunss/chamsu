"use client";

import { useMemo } from "react";
import { RoomList } from "@/components/chat/RoomList";
import { buildRoomItems } from "@/lib/claude/roomList";

/** Chat 탭의 채팅방 목록: 제목과 페르소나마다 내 방 하나. selected 는 지금 열린 방의 페르소나 id 다. */
export function ChatRoomList({ uid, selected = null }: { uid: string; selected?: string | null }) {
  const items = useMemo(() => buildRoomItems(uid), [uid]);
  return (
    <div className="flex h-full flex-col">
      <h1 className="border-b border-zinc-200 px-4 pb-3 pt-5 text-2xl font-bold md:border-b-0">Chat</h1>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RoomList uid={uid} items={items} selected={selected} />
      </div>
    </div>
  );
}
