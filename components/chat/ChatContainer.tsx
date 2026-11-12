"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getClientDb } from "@/lib/firebaseClient";
import { useMessages } from "@/components/chat/useMessages";
import { usePresence } from "@/components/chat/usePresence";
import { useClaudeTyping } from "@/components/chat/useClaudeTyping";
import { useBotChain } from "@/components/chat/useBotChain";
import { ConnectionBanner } from "@/components/chat/ConnectionBanner";
import { ChatDesktop } from "@/components/chat/desktop/ChatDesktop";
import { ChatMobile } from "@/components/chat/mobile/ChatMobile";
import type { ChatViewProps } from "@/components/chat/MessageList";
import { findMentions, findPersonaById } from "@/lib/claude/personas/info";
import { buildRoomItems } from "@/lib/claude/roomList";
import { MAIN_ROOM_ID, resolveRoom } from "@/lib/claude/rooms";

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
  const [roomId, setRoomId] = useState(MAIN_ROOM_ID);
  const [showList, setShowList] = useState(true);
  const rooms = useMemo(() => buildRoomItems(uid), [uid]);
  const room = resolveRoom(roomId)!;
  const dmPersona = room.kind === "dm" ? findPersonaById(room.personaIds[0]) : null;

  const { messages, loadOlder, hasOlder, offline, synced } = useMessages(room.messagesPath);
  const online = usePresence(uid, nickname);
  const typing = useClaudeTyping(room.jobsPath);
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

  /** 봇 답이 다른 봇을 부르면 이어서 부른다. 실패하면 연쇄가 거기서 멈출 뿐 따로 알리지 않는다. */
  const callChain = useCallback((messageId: string) => {
    void callClaude(MAIN_ROOM_ID, messageId);
  }, []);
  useBotChain(roomId, room.kind === "group", messages, synced, uid, callChain);

  const send = useCallback(
    async (text: string) => {
      try {
        const ref = await addDoc(collection(getClientDb(), room.messagesPath), {
          text, nickname, uid, createdAt: serverTimestamp(),
        });
        setClaudeFailed(null);
        const callees = room.kind === "dm" ? (dmPersona ? [dmPersona] : []) : findMentions(text);
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
    [uid, nickname, room.messagesPath, room.kind, room.id, dmPersona],
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
    claudeFailed,
    rooms,
    roomId,
    roomTitle: dmPersona ? dmPersona.nickname : "전체 채팅방",
    isGroup: room.kind === "group",
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
