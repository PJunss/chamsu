"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@/components/chat/useMessages";
import type { OnlineUser } from "@/lib/presence";
import { isNearBottom } from "@/lib/scroll";
import { BOT_NICKNAME, BOT_UID } from "@/lib/claude/constants";

export type ChatViewProps = {
  me: string;
  messages: ChatMessage[];
  online: OnlineUser[];
  hasOlder: boolean;
  offline: boolean;
  loadOlder: () => Promise<void>;
  send: (text: string) => Promise<boolean>;
  claudeTyping: boolean;
  claudeFailed: boolean;
};

const timeFmt = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" });

export function MessageList({
  me,
  messages,
  hasOlder,
  loadOlder,
  claudeTyping,
}: Pick<ChatViewProps, "me" | "messages" | "hasOlder" | "loadOlder" | "claudeTyping">) {
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

  useLayoutEffect(() => {
    const el = box.current;
    if (el && claudeTyping && stick.current) el.scrollTop = el.scrollHeight;
  }, [claudeTyping]);

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
          const bot = m.uid === BOT_UID;
          return (
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && (
                <span className="mb-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  {m.nickname}
                  {bot && <span className="rounded border border-zinc-300 px-1 text-[10px] leading-4 text-zinc-400">봇</span>}
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
            </li>
          );
        })}
        {claudeTyping && (
          <li className="flex items-start">
            <span className="animate-pulse text-xs text-zinc-400">{BOT_NICKNAME}가 입력 중…</span>
          </li>
        )}
      </ul>
    </div>
  );
}
