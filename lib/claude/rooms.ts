import { PERSONAS, findPersonaById, type PersonaInfo } from "@/lib/claude/personas/info";

/** 사용자 한 명과 페르소나 하나의 1:1 방. 엔진은 이 값의 경로·문구만 쓴다. 브라우저도 import 한다. */
export type Room = {
  id: string;
  personaId: string;
  ownerUid: string;
  messagesPath: string;
  jobsPath: string;
  description: string;
  judgeState: string;
};

const ROOM_PATTERN = /^([A-Za-z0-9]{1,128})_([a-z0-9]+)$/;

export function roomIdFor(uid: string, personaId: string): string {
  return `${uid}_${personaId}`;
}

/** 방 id `{uid}_{personaId}` 에서 방을 정한다. 방 문서를 읽지 않는다. 형식이 틀리거나 페르소나가 없으면 null. */
export function resolveRoom(roomId: string, list: readonly PersonaInfo[] = PERSONAS): Room | null {
  const m = ROOM_PATTERN.exec(roomId);
  if (!m) return null;
  const persona = findPersonaById(m[2], list);
  if (!persona) return null;
  return {
    id: roomId,
    personaId: persona.id,
    ownerUid: m[1],
    messagesPath: `rooms/${roomId}/messages`,
    jobsPath: `rooms/${roomId}/claudeJobs`,
    description: `${persona.nickname}와 사용자 한 명이 나누는 1:1 대화방`,
    judgeState: "사용자와 봇의 한국어 1:1 대화 메시지를 하나씩 평가한다.",
  };
}

export type Target = { persona: PersonaInfo; question: string };

/** 방 주인이 쓴, 본문이 비어 있지 않은 메시지면 그 방 페르소나와 질문(앞뒤 공백을 지운 본문). 그 밖은 null. */
export function pickTarget(
  room: Room,
  message: { uid: string; text: string },
  list: readonly PersonaInfo[] = PERSONAS,
): Target | null {
  if (message.uid !== room.ownerUid) return null;
  const question = message.text.trim();
  const persona = findPersonaById(room.personaId, list);
  return question && persona ? { persona, question } : null;
}
