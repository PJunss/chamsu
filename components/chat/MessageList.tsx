"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@/components/chat/useMessages";
import { isNearBottom } from "@/lib/scroll";
import { BotAvatar } from "@/components/chat/BotAvatar";
import { findPersonaByUid, type PersonaInfo } from "@/lib/claude/personas/info";
import { shownAffinity } from "@/lib/claude/affinity";

export type ChatViewProps = {
  me: string;
  messages: ChatMessage[];
  hasOlder: boolean;
  offline: boolean;
  loadOlder: () => Promise<void>;
  send: (text: string) => Promise<boolean>;
  /** 지금 방에서 답을 쓰는 중인 페르소나 */
  typing: PersonaInfo[];
  /** 지금 방에서 내 호감도, 페르소나 id → 화면 점수. 문서가 없는 페르소나는 빠져 있다. 아직 모르면(로딩·오류) null */
  affinity: Record<string, number> | null;
  /** 그 방 페르소나의 화면 호감도. 아직 모르면 null */
  titleAffinity: number | null;
  /** 호출에 실패한 페르소나 닉네임. 없으면 null */
  claudeFailed: string | null;
  /** 입력창 위에 보일 내 10분 한도 한 줄. exhausted 는 다 써서 풀리기를 기다리는 중인지다. 보이지 않을 때는 null */
  quota: { text: string; exhausted: boolean } | null;
  roomId: string;
  /** 방 페르소나의 닉네임과 아바타 */
  roomTitle: string;
  avatar: string;
  placeholder?: string;
};

/** 호감도 표시 `♥ {점수}`. */
export function AffinityBadge({ score }: { score: number }) {
  return (
    <span className="text-[10px] leading-4 text-rose-400" aria-label={`호감도 ${score}`}>
      ♥ {score}
    </span>
  );
}

const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" });

export function MessageList({
  me,
  messages,
  hasOlder,
  loadOlder,
  typing,
  affinity,
}: Pick<ChatViewProps, "me" | "messages" | "hasOlder" | "loadOlder" | "typing" | "affinity">) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef<number | null>(null);
  const lastId = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const newestId = messages[messages.length - 1]?.id;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (newestId !== lastId.current && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastId.current = newestId;
  }, [messages]);

  const typingCount = typing.length;
  useLayoutEffect(() => {
    const el = box.current;
    if (el && typingCount > 0 && stick.current) el.scrollTop = el.scrollHeight;
  }, [typingCount]);

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  async function onScroll() {
    const el = box.current;
    if (!el) return;
    stick.current = isNearBottom(el);
    if (el.scrollTop === 0 && hasOlder) {
      prevHeight.current = el.scrollHeight;
      try {
        await loadOlder();
      } catch {
        prevHeight.current = null;
      }
    }
  }

  return (
    <div ref={box} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3">
      <ul className="flex flex-col gap-2">
        {messages.map((m) => {
          const mine = m.uid === me;
          const bot = findPersonaByUid(m.uid);
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"} gap-2`}>
              {bot && <BotAvatar src={bot.avatar} alt={bot.nickname} />}
              <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && (
                <span className="mb-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  {m.nickname}
                  {bot && <span className="rounded border border-zinc-300 px-1 text-[10px] leading-4 text-zinc-400">봇</span>}
                  {bot && affinity && <AffinityBadge score={shownAffinity(affinity, bot.id)} />}
                </span>
              )}
              <div className="flex items-end gap-1.5">
                {mine && <time className="text-[11px] text-zinc-400">{m.createdAt ? timeFmt.format(m.createdAt) : ""}</time>}
                <p
                  className={`max-w-[70vw] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm md:max-w-md ${
                    mine ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-900"
                  }`}
                >
                  {m.text}
                </p>
                {!mine && <time className="text-[11px] text-zinc-400">{m.createdAt ? timeFmt.format(m.createdAt) : ""}</time>}
              </div>
              </div>
            </li>
          );
        })}
        {typing.map((p) => (
          <li key={`typing-${p.id}`} className="flex justify-start gap-2" aria-live="polite">
            <BotAvatar src={p.avatar} alt={p.nickname} />
            <div className="flex min-w-0 flex-col items-start">
              <span className="mb-0.5 text-xs text-zinc-500">{p.nickname}가 입력 중</span>
              <p className="flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-3" aria-label={`${p.nickname}가 입력 중`}>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
