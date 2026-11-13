"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoginPrompt } from "@/components/auth/LoginPrompt";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatRoomList } from "@/components/chat/ChatRoomList";
import { shownDisplayName } from "@/lib/displayName";
import { useDisplayName } from "@/lib/userDoc";

/**
 * Chat 탭. personaId 가 null 이면 목록 화면, 있으면 그 캐릭터와의 대화 화면이다.
 * 휴대폰은 둘 중 하나만, 데스크톱은 왼쪽에 목록과 오른쪽에 대화를 함께 보인다.
 * 로그인 전이면 로그인 버튼을 보이고, 로그인 상태를 아직 모르면 빈 화면이다.
 */
export function ChatPage({ personaId }: { personaId: string | null }) {
  const auth = useAuth();
  if (auth.status === "loading") return null;
  if (auth.status === "out") return <LoginPrompt title="Chat" />;
  return <SignedInChat uid={auth.uid} googleName={auth.googleName} personaId={personaId} />;
}

/** 대화는 닉네임을 알 때 연다. 유저 문서를 읽지 못하면 구글 표시 이름으로 연다. */
function SignedInChat({ uid, googleName, personaId }: { uid: string; googleName: string | null; personaId: string | null }) {
  const displayName = shownDisplayName(useDisplayName(uid), googleName);
  return (
    <div className="flex h-full">
      <aside className={`${personaId ? "hidden md:block" : "block"} w-full md:w-[300px] md:shrink-0 md:border-r md:border-zinc-200`}>
        <ChatRoomList uid={uid} selected={personaId} />
      </aside>
      <section className={`${personaId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {personaId === null ? (
          <p className="m-auto text-sm text-zinc-400">대화할 상대를 고르세요</p>
        ) : (
          displayName !== null && <ChatContainer key={personaId} uid={uid} displayName={displayName} personaId={personaId} />
        )}
      </section>
    </div>
  );
}
