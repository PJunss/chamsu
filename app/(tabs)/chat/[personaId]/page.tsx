import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ChatPage } from "@/components/chat/ChatPage";
import { PERSONAS, findPersonaById } from "@/lib/claude/personas/info";

type Params = Promise<{ personaId: string }>;

/** 등록된 페르소나의 대화 화면은 빌드 때 미리 만든다. */
export function generateStaticParams() {
  return PERSONAS.map((p) => ({ personaId: p.id }));
}

/** 주소의 페르소나 id 는 Suspense 안에서 읽는다. 그래야 화면 틀이 주소를 기다리지 않고 먼저 그려진다. */
export default function ChatRoomPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ChatRoom params={params} />
    </Suspense>
  );
}

async function ChatRoom({ params }: { params: Params }) {
  const { personaId } = await params;
  if (!findPersonaById(personaId)) notFound();
  return <ChatPage personaId={personaId} />;
}
