/**
 * 브라우저와 서버가 함께 쓰는 페르소나 공개 정보.
 * 캐릭터마다 lib/claude/personas/{id}/persona.ts(캐릭터·말투·안내 문구)와 public/personas/{id}/avatar.*(아바타)를 둔다.
 * 새 페르소나는 그 두 폴더를 만들고 여기 한 줄과 서버 목록(personas/index.ts)에 더한다.
 */
export type PersonaInfo = { id: string; uid: string; nickname: string; avatar: string };

export const PERSONAS: readonly PersonaInfo[] = [
  { id: "bianca", uid: "bot_bianca", nickname: "비앙카", avatar: "/personas/bianca/avatar.jpeg" },
  { id: "lucia", uid: "bot_lucia", nickname: "루치아", avatar: "/personas/lucia/avatar.png" },
];

export function findPersonaByUid(uid: string, list: readonly PersonaInfo[] = PERSONAS): PersonaInfo | null {
  return list.find((p) => p.uid === uid) ?? null;
}

export function findPersonaById(id: string, list: readonly PersonaInfo[] = PERSONAS): PersonaInfo | null {
  return list.find((p) => p.id === id) ?? null;
}

export function isBotUid(uid: string, list: readonly PersonaInfo[] = PERSONAS): boolean {
  return list.some((p) => p.uid === uid);
}
