"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { BotAvatar } from "@/components/chat/BotAvatar";
import { RoomAffinity } from "@/components/chat/RoomList";
import { PERSONAS } from "@/lib/claude/personas/info";
import { roomIdFor } from "@/lib/claude/rooms";

/** 홈의 챗봇 카드. 누르면 그 캐릭터와의 대화로 간다. 로그인했을 때만 내 호감도를 함께 보인다. */
export function ChatbotCards() {
  const auth = useAuth();
  const uid = auth.status === "in" ? auth.uid : null;
  return (
    <section className="px-4 md:max-w-[400px] md:px-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">챗봇</h2>
        <Link href="/chat" className="text-xs text-zinc-500">
          Chat ›
        </Link>
      </div>
      <ul className="flex flex-col gap-2.5">
        {PERSONAS.map((p) => (
          <li key={p.id}>
            <Link
              href={`/chat/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
            >
              <BotAvatar src={p.avatar} alt={p.nickname} size={44} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[15px] font-bold text-zinc-900">{p.nickname}</span>
                  {uid && <RoomAffinity uid={uid} roomId={roomIdFor(uid, p.id)} personaId={p.id} />}
                </span>
                <span className="text-xs text-zinc-500">{p.nickname}와 대화하기</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
