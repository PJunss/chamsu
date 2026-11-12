/** 브라우저와 서버가 함께 쓰는 페르소나 공개 정보. 새 페르소나는 여기 한 줄과 서버 목록(personas/index.ts)에 더한다. */
export type PersonaInfo = { id: string; uid: string; nickname: string; trigger: string; avatar: string };

export const PERSONAS: readonly PersonaInfo[] = [
  { id: "bianca", uid: "claude", nickname: "비앙카", trigger: "@비앙카", avatar: "/bianca.jpeg" },
  { id: "lucia", uid: "lucia", nickname: "루치아", trigger: "@루치아", avatar: "/lucia.jpeg" },
];

/** 앞뒤 공백을 지운 메시지가 부르는 말로 시작하면 그 페르소나와 질문 본문. 부르는 말이 앞부분을 공유하면 긴 것을 고른다. */
export function findPersonaByTrigger(
  text: string,
  list: readonly PersonaInfo[] = PERSONAS,
): { persona: PersonaInfo; question: string } | null {
  const t = text.trim();
  let best: PersonaInfo | null = null;
  for (const p of list) {
    if (t.startsWith(p.trigger) && (!best || p.trigger.length > best.trigger.length)) best = p;
  }
  if (!best) return null;
  const question = t.slice(best.trigger.length).trim();
  return question ? { persona: best, question } : null;
}

export function findPersonaByUid(uid: string, list: readonly PersonaInfo[] = PERSONAS): PersonaInfo | null {
  return list.find((p) => p.uid === uid) ?? null;
}

export function findPersonaById(id: string, list: readonly PersonaInfo[] = PERSONAS): PersonaInfo | null {
  return list.find((p) => p.id === id) ?? null;
}

export function isBotUid(uid: string, list: readonly PersonaInfo[] = PERSONAS): boolean {
  return list.some((p) => p.uid === uid);
}
