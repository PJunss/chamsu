import { BOT_CHAIN_MAX } from "@/lib/claude/constants";
import { PERSONAS, findMentions, findPersonaById, isBotUid, type PersonaInfo } from "@/lib/claude/personas/info";

/** 봇이 답하는 방. 엔진은 kind 를 직접 보지 않고 이 값의 경로·문구만 쓴다. 브라우저도 import 한다. */
export type Room = {
  id: string;
  kind: "dm" | "group";
  personaIds: string[];
  ownerUid: string | null;
  messagesPath: string;
  jobsPath: string;
  description: string;
  judgeState: string;
};

export const MAIN_ROOM_ID = "main";

const DM_PATTERN = /^dm_([a-z0-9]+)_(n_[0-9a-f]{32})$/;

export function dmRoomId(personaId: string, uid: string): string {
  return `dm_${personaId}_${uid}`;
}

/** 방 id 에서 방을 정한다. 방 문서를 읽지 않는다. 형식이 틀리거나 페르소나가 없으면 null. */
export function resolveRoom(roomId: string, list: readonly PersonaInfo[] = PERSONAS): Room | null {
  if (roomId === MAIN_ROOM_ID) {
    return {
      id: MAIN_ROOM_ID,
      kind: "group",
      personaIds: list.map((p) => p.id),
      ownerUid: null,
      messagesPath: "messages",
      jobsPath: "claudeJobs",
      description: '친구 일곱 명이 쓰는 잡담방 "chamsu"',
      judgeState: "친구 7명의 한국어 단체 채팅방 메시지를 하나씩 평가한다.",
    };
  }
  const m = DM_PATTERN.exec(roomId);
  if (!m) return null;
  const persona = findPersonaById(m[1], list);
  if (!persona) return null;
  return {
    id: roomId,
    kind: "dm",
    personaIds: [persona.id],
    ownerUid: m[2],
    messagesPath: `rooms/${roomId}/messages`,
    jobsPath: `rooms/${roomId}/claudeJobs`,
    description: `${persona.nickname}와 사용자 한 명이 나누는 1:1 대화방`,
    judgeState: "사용자와 봇의 한국어 1:1 대화 메시지를 하나씩 평가한다.",
  };
}

export type ChainMessage = { uid: string; text: string; chainDepth?: unknown; chainRootUid?: unknown };

export type Targets = { personas: PersonaInfo[]; question: string; chainDepth: number; chainRootUid: string };

/**
 * 그 방에서 답할 메시지면 답할 페르소나들과 질문, 그 답에 저장할 연쇄 단계·연쇄를 시작한 사람.
 * 단체방은 부르는 말로 찾는다. 봇 메시지는 서버 내부 연쇄 요청(internal)이고 chainDepth 가 BOT_CHAIN_MAX 이하일 때만
 * 자기 말고 다른 봇을 부른다.
 * 1:1 방은 주인이 쓴 메시지 전체가 질문이다.
 */
export function pickTargets(
  room: Room,
  message: ChainMessage,
  list: readonly PersonaInfo[] = PERSONAS,
  opts: { internal?: boolean } = {},
): Targets | null {
  const question = message.text.trim();
  if (room.kind === "group") {
    const mentioned = findMentions(message.text, list).filter((p) => room.personaIds.includes(p.id));
    if (!isBotUid(message.uid, list)) {
      return mentioned.length > 0 ? { personas: mentioned, question, chainDepth: 1, chainRootUid: message.uid } : null;
    }
    if (!opts.internal) return null;
    const { chainDepth, chainRootUid } = message;
    if (typeof chainDepth !== "number" || !Number.isInteger(chainDepth) || chainDepth < 1 || chainDepth > BOT_CHAIN_MAX) return null;
    if (typeof chainRootUid !== "string" || !chainRootUid) return null;
    const personas = mentioned.filter((p) => p.uid !== message.uid);
    return personas.length > 0 ? { personas, question, chainDepth: chainDepth + 1, chainRootUid } : null;
  }
  if (isBotUid(message.uid, list) || message.uid !== room.ownerUid) return null;
  const persona = findPersonaById(room.personaIds[0], list);
  return question && persona ? { personas: [persona], question, chainDepth: 1, chainRootUid: message.uid } : null;
}
