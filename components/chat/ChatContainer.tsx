"use client";

import { useCallback, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientAuth, getClientDb } from "@/lib/firebaseClient";
import { useMessages } from "@/components/chat/useMessages";
import { useClaudeTyping } from "@/components/chat/useClaudeTyping";
import { useAffinity } from "@/components/chat/useAffinity";
import { useClearedAt } from "@/components/chat/useClearedAt";
import { shownAffinity } from "@/lib/claude/affinity";
import { ConnectionBanner } from "@/components/chat/ConnectionBanner";
import { ChatDesktop } from "@/components/chat/desktop/ChatDesktop";
import { ChatMobile } from "@/components/chat/mobile/ChatMobile";
import type { ChatViewProps } from "@/components/chat/MessageList";
import { resolveRoom, roomIdFor } from "@/lib/claude/rooms";
import { findPersonaById } from "@/lib/claude/personas/info";

/**
 * 서버가 방에 아무것도 쓰지 못한 경우(네트워크 오류·서버 오류·로그인 확인 실패).
 * 429·502 는 서버가 안내를 쓰고, 409 는 다른 호출이 처리 중이다.
 */
const CLAUDE_UNREPORTED = new Set([400, 401, 403, 404, 410, 500]);

/** 내 ID 토큰을 붙여 봇을 부른다. 토큰이 없으면 부르지 않고 실패로 본다. */
async function callClaude(roomId: string, messageId: string): Promise<boolean> {
  try {
    const token = await getClientAuth().currentUser?.getIdToken();
    if (!token) return false;
    const res = await fetch("/api/claude", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ roomId, messageId }),
    });
    return !CLAUDE_UNREPORTED.has(res.status);
  } catch (e) {
    console.warn("claude call failed", e instanceof Error ? e.name : "unknown");
    return false;
  }
}

/**
 * 내 uid 와 페르소나 하나의 1:1 대화. 구독(메시지, 입력 중, 호감도, 지운 시각)은 여기서 한 번만 걸고
 * 휴대폰·데스크톱 화면에 같은 값을 넘긴다. personaId 는 등록된 페르소나여야 한다.
 */
export function ChatContainer({ uid, displayName, personaId }: { uid: string; displayName: string; personaId: string }) {
  const room = resolveRoom(roomIdFor(uid, personaId))!;
  const persona = findPersonaById(personaId)!;

  const cleared = useClearedAt(`rooms/${room.id}`);
  const { messages, loadOlder, hasOlder, offline } = useMessages(room.messagesPath, cleared);
  const typing = useClaudeTyping(room.jobsPath);
  const affinity = useAffinity(room.id, uid, cleared);
  const [claudeFailed, setClaudeFailed] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      try {
        const ref = await addDoc(collection(getClientDb(), room.messagesPath), {
          text, nickname: displayName, uid, createdAt: serverTimestamp(),
        });
        setClaudeFailed(null);
        void callClaude(room.id, ref.id).then((ok) => {
          if (!ok) setClaudeFailed(persona.nickname);
        });
        return true;
      } catch {
        return false;
      }
    },
    [uid, displayName, room.messagesPath, room.id, persona.nickname],
  );

  const props: ChatViewProps = {
    me: uid,
    messages,
    hasOlder,
    offline,
    loadOlder,
    send,
    typing,
    affinity: affinity.ready ? affinity.scores : null,
    titleAffinity: affinity.ready ? shownAffinity(affinity.scores, persona.id) : null,
    claudeFailed,
    roomId: room.id,
    roomTitle: persona.nickname,
    avatar: persona.avatar,
    placeholder: `${persona.nickname}에게 메시지`,
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <ConnectionBanner offline={offline} />
      <div className="min-h-0 flex-1 md:hidden">
        <ChatMobile {...props} />
      </div>
      <div className="hidden min-h-0 flex-1 md:block">
        <ChatDesktop {...props} />
      </div>
    </div>
  );
}
