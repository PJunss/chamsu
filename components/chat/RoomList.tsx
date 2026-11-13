"use client";

import Link from "next/link";
import { BotAvatar } from "@/components/chat/BotAvatar";
import { AffinityBadge } from "@/components/chat/MessageList";
import { useAffinity } from "@/components/chat/useAffinity";
import { useClearedAt } from "@/components/chat/useClearedAt";
import { shownAffinity } from "@/lib/claude/affinity";
import type { RoomItem } from "@/lib/claude/roomList";

/** 그 방에서 내 호감도 `♥ {점수}`. 아직 모르면(로딩·오류) 아무것도 그리지 않는다. */
export function RoomAffinity({ uid, roomId, personaId }: { uid: string; roomId: string; personaId: string }) {
  const cleared = useClearedAt(`rooms/${roomId}`);
  const affinity = useAffinity(roomId, uid, cleared);
  return affinity.ready ? <AffinityBadge score={shownAffinity(affinity.scores, personaId)} /> : null;
}

/** 방마다 한 줄(아바타, 이름, 호감도). 누르면 그 캐릭터와의 대화(/chat/{personaId})로 간다. */
export function RoomList({ uid, items, selected }: { uid: string; items: RoomItem[]; selected: string | null }) {
  return (
    <ul className="flex flex-col">
      {items.map((it) => {
        const on = it.personaId === selected;
        return (
          <li key={it.roomId} className="border-b border-zinc-200 md:border-b-0">
            <Link
              href={`/chat/${it.personaId}`}
              aria-current={on ? "page" : undefined}
              className={`flex items-center gap-3 px-4 py-3 ${on ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
            >
              <BotAvatar src={it.avatar} alt={it.title} size={48} />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[15px] font-bold text-zinc-900">{it.title}</span>
                <RoomAffinity uid={uid} roomId={it.roomId} personaId={it.personaId} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
