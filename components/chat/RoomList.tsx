"use client";

import { BotAvatar } from "@/components/chat/BotAvatar";
import type { RoomItem } from "@/lib/claude/roomList";

export function RoomList({
  items,
  selected,
  onSelect,
}: {
  items: RoomItem[];
  selected: string | null;
  onSelect: (roomId: string) => void;
}) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map((it) => (
        <button
          key={it.roomId}
          type="button"
          onClick={() => onSelect(it.roomId)}
          className={`flex items-center gap-3 rounded px-2 py-2 text-left text-sm ${
            it.roomId === selected ? "bg-zinc-100 font-semibold" : "hover:bg-zinc-50"
          }`}
        >
          {it.avatar ? (
            <BotAvatar src={it.avatar} alt={it.title} />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] text-zinc-600">
              전체
            </span>
          )}
          <span className="truncate">{it.title}</span>
        </button>
      ))}
    </nav>
  );
}
