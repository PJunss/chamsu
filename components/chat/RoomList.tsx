"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BotAvatar } from "@/components/chat/BotAvatar";
import { AffinityBadge } from "@/components/chat/MessageList";
import { useAffinity } from "@/components/chat/useAffinity";
import { useClearedAt } from "@/components/chat/useClearedAt";
import { useLastMessage } from "@/components/chat/useLastMessage";
import { shownAffinity } from "@/lib/claude/affinity";
import type { RoomItem } from "@/lib/claude/roomList";
import { lastMessagePreview, lastMessageTime } from "@/lib/lastMessage";

/** 그 방에서 내 호감도 `♥ {점수}`. 아직 모르면(로딩·오류) 아무것도 그리지 않는다. */
export function RoomAffinity({ uid, roomId, personaId }: { uid: string; roomId: string; personaId: string }) {
  const cleared = useClearedAt(`rooms/${roomId}`);
  const affinity = useAffinity(roomId, uid, cleared);
  return affinity.ready ? <AffinityBadge score={shownAffinity(affinity.scores, personaId)} /> : null;
}

/** "어제" 같은 표시가 날짜가 넘어가면 바뀌도록 1분마다 지금 시각을 다시 준다. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** 방 한 줄: 아바타, 이름과 호감도, 마지막 메시지 한 줄, 그 시각. */
function RoomRow({ uid, item, on, now }: { uid: string; item: RoomItem; on: boolean; now: Date }) {
  const cleared = useClearedAt(`rooms/${item.roomId}`);
  const affinity = useAffinity(item.roomId, uid, cleared);
  const last = useLastMessage(item.roomId, cleared);
  return (
    <Link
      href={`/chat/${item.personaId}`}
      aria-current={on ? "page" : undefined}
      className={`flex items-center gap-3 px-4 py-3 ${on ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
    >
      <BotAvatar src={item.avatar} alt={item.title} size={48} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-bold text-zinc-900">{item.title}</span>
          {affinity.ready && <AffinityBadge score={shownAffinity(affinity.scores, item.personaId)} />}
        </span>
        <span className="truncate text-[13px] text-zinc-500">{last.ready ? lastMessagePreview(last.message, uid) : " "}</span>
      </span>
      {last.ready && last.message && (
        <time className="shrink-0 self-start pt-1 text-[11px] text-zinc-400">{lastMessageTime(last.message.createdAt, now)}</time>
      )}
    </Link>
  );
}

/** 방마다 한 줄. 누르면 그 캐릭터와의 대화(/chat/{personaId})로 간다. */
export function RoomList({ uid, items, selected }: { uid: string; items: RoomItem[]; selected: string | null }) {
  const now = useNow();
  return (
    <ul className="flex flex-col">
      {items.map((it) => (
        <li key={it.roomId} className="border-b border-zinc-200 md:border-b-0">
          <RoomRow uid={uid} item={it} on={it.personaId === selected} now={now} />
        </li>
      ))}
    </ul>
  );
}
