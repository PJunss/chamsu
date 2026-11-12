/**
 * 브라우저와 서버가 함께 쓰는 페르소나 공개 정보.
 * 캐릭터마다 lib/claude/personas/{id}/persona.ts(캐릭터·말투·안내 문구)와 public/personas/{id}/avatar.*(아바타)를 둔다.
 * 새 페르소나는 그 두 폴더를 만들고 여기 한 줄과 서버 목록(personas/index.ts)에 더한다.
 */
export type PersonaInfo = { id: string; uid: string; nickname: string; trigger: string; avatar: string };

export const PERSONAS: readonly PersonaInfo[] = [
  { id: "bianca", uid: "bot_bianca", nickname: "비앙카", trigger: "@비앙카", avatar: "/personas/bianca/avatar.jpeg" },
  { id: "lucia", uid: "bot_lucia", nickname: "루치아", trigger: "@루치아", avatar: "/personas/lucia/avatar.png" },
];

/**
 * 앞뒤 공백을 지운 본문에서 부르는 말이 나오는 곳을 모두 찾아, 처음 나온 순서로 페르소나를 중복 없이 돌려준다.
 * 같은 위치에서 여러 부르는 말이 맞으면 긴 것을 고른다. 부르는 말을 모두 지운 나머지가 공백뿐이면 빈 배열이다.
 */
export function findMentions(text: string, list: readonly PersonaInfo[] = PERSONAS): PersonaInfo[] {
  const t = text.trim();
  const found: PersonaInfo[] = [];
  let rest = "";
  let i = 0;
  while (i < t.length) {
    let best: PersonaInfo | null = null;
    for (const p of list) {
      if (p.trigger && t.startsWith(p.trigger, i) && (!best || p.trigger.length > best.trigger.length)) best = p;
    }
    if (best) {
      if (!found.includes(best)) found.push(best);
      i += best.trigger.length;
    } else {
      rest += t[i];
      i += 1;
    }
  }
  return rest.trim() ? found : [];
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
