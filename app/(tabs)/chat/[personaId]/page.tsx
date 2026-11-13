import { notFound } from "next/navigation";
import { ChatPage } from "@/components/chat/ChatPage";
import { PERSONAS, findPersonaById } from "@/lib/claude/personas/info";

/** 등록된 페르소나의 대화 화면은 빌드 때 미리 만든다. */
export function generateStaticParams() {
  return PERSONAS.map((p) => ({ personaId: p.id }));
}

export default async function ChatRoomPage({ params }: { params: Promise<{ personaId: string }> }) {
  const { personaId } = await params;
  if (!findPersonaById(personaId)) notFound();
  return <ChatPage personaId={personaId} />;
}
