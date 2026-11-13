"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { useMessages } from "@/components/chat/useMessages";
import { usePresence } from "@/components/chat/usePresence";
import { useClaudeTyping } from "@/components/chat/useClaudeTyping";
import { useAffinity } from "@/components/chat/useAffinity";
import { useClearedAt } from "@/components/chat/useClearedAt";
import { shownAffinity } from "@/lib/claude/affinity";
import { ConnectionBanner } from "@/components/chat/ConnectionBanner";
import { ChatDesktop } from "@/components/chat/desktop/ChatDesktop";
import { ChatMobile } from "@/components/chat/mobile/ChatMobile";
import type { ChatViewProps } from "@/components/chat/MessageList";
import { findPersonaById } from "@/lib/claude/personas/info";
import { buildRoomItems } from "@/lib/claude/roomList";
import { resolveRoom } from "@/lib/claude/rooms";

/** 서버가 방에 아무것도 쓰지 못한 경우(네트워크 오류·서버 오류). 429·502 는 서버가 안내를 쓰고, 409 는 다른 호출이 처리 중이다. */
const CLAUDE_UNREPORTED = new Set([400, 404, 410, 500]);

function callClaude(roomId: string, messageId: string): Promise<boolean> {
  return fetch("/api/claude", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, messageId }),
  }).then(
    (res) => !CLAUDE_UNREPORTED.has(res.status),
    (e: unknown) => {
      console.warn("claude call failed", e instanceof Error ? e.name : "unknown");
      return false;
    },
  );
}

export function ChatContainer({ uid, nickname }: { uid: string; nickname: string }) {
  const rooms = useMemo(() => buildRoomItems(uid), [uid]);
  const [roomId, setRoomId] = useState(rooms[0].roomId);
  const [showList, setShowList] = useState(true);
  const room = resolveRoom(roomId)!;
  const dmPersona = findPersonaById(room.personaId);

  const cleared = useClearedAt(`rooms/${room.id}`);
  const { messages, loadOlder, hasOlder, offline } = useMessages(room.messagesPath, cleared);
  const online = usePresence(uid, nickname);
  const typing = useClaudeTyping(room.jobsPath);
  const affinity = useAffinity(room.id, uid, cleared);
  const [claudeFailed, setClaudeFailed] = useState<string | null>(null);
  /** 늦게 도착한 호출 실패가 다른 방에 표시되지 않도록 지금 보고 있는 방 id 를 둔다. */
  const currentRoom = useRef(roomId);
  useEffect(() => {
    currentRoom.current = roomId;
  }, [roomId]);

  const selectRoom = useCallback((next: string) => {
    setRoomId(next);
    setShowList(false);
    setClaudeFailed(null);
  }, []);
  const backToList = useCallback(() => setShowList(true), []);

  const send = useCallback(
    async (text: string) => {
      try {
        const ref = await addDoc(collection(getClientDb(), room.messagesPath), {
          text, nickname, uid, createdAt: serverTimestamp(),
        });
        setClaudeFailed(null);
        const callees = dmPersona ? [dmPersona] : [];
        if (callees.length > 0) {
          const sentRoom = room.id;
          void callClaude(sentRoom, ref.id).then((ok) => {
            if (!ok && currentRoom.current === sentRoom) setClaudeFailed(callees.map((p) => p.nickname).join(", "));
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    [uid, nickname, room.messagesPath, room.id, dmPersona],
  );

  const props: ChatViewProps = {
    me: uid,
    messages,
    online,
    hasOlder,
    offline,
    loadOlder,
    send,
    typing,
    affinity: affinity.ready ? affinity.scores : null,
    titleAffinity: dmPersona && affinity.ready ? shownAffinity(affinity.scores, dmPersona.id) : null,
    claudeFailed,
    rooms,
    roomId,
    roomTitle: dmPersona ? dmPersona.nickname : "전체 채팅방",
    isGroup: false,
    placeholder: dmPersona ? `${dmPersona.nickname}에게 말하기` : undefined,
    selectRoom,
    showList,
    backToList,
  };

  return (
    <main className="flex h-dvh flex-col bg-white">
      <ConnectionBanner offline={offline} />
      <div className="min-h-0 flex-1 md:hidden">
        <ChatMobile {...props} />
      </div>
      <div className="hidden min-h-0 flex-1 md:block">
        <ChatDesktop {...props} />
      </div>
    </main>
  );
}
