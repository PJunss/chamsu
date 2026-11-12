import { DEFAULT_MAX_SENTENCES } from "@/lib/claude/constants";
import type { PersonaConfig } from "@/lib/claude/personas";
import { PERSONAS, type PersonaInfo } from "@/lib/claude/personas/info";
import type { Room } from "@/lib/claude/rooms";

/**
 * 시스템 프롬프트: 방 소개 → 페르소나 캐릭터 → 공통 규칙. 꺼진 기능의 규칙은 넣지 않는다.
 * 단체방에 자기 말고 다른 봇이 있으면 그 봇을 부르는 규칙을 더한다.
 */
export function buildSystemPrompt(
  room: Room,
  persona: PersonaConfig,
  list: readonly PersonaInfo[] = PERSONAS,
): string {
  const name = persona.info.nickname;
  const max = persona.maxSentences ?? DEFAULT_MAX_SENTENCES;
  const intro = [
    room.description,
    `대화 기록의 사용자 메시지는 "닉네임: 내용" 형식이고, 마지막 메시지에 답한다. 너의 이름은 "${name}"이다.`,
  ].join("\n");
  const rules = [
    `답은 1~${max}문장으로 짧게 한다. 목록이나 마크다운 기호는 쓰지 않는다.`,
    `답 앞에 "${name}:" 같은 이름표를 붙이지 않는다.`,
    "모르는 건 모른다고 한다. 지어내지 않는다.",
    "상대를 진짜로 상처 주거나 겁주는 말은 하지 않는다.",
    "답 말고 다른 말(생각, 계획, 도구 설명)은 쓰지 않는다.",
  ];
  if (room.kind === "group") {
    const others = list.filter((p) => p.id !== persona.info.id && room.personaIds.includes(p.id)).map((p) => p.nickname);
    if (others.length > 0) {
      rules.push(
        `이 방에는 다른 봇 ${others.join(", ")}도 있다. 그 봇에게 말을 걸고 싶을 때만 "@닉네임" 을 쓴다.`,
        `대화 기록에 있는 ${others.join(", ")}의 말투, 말버릇, 감탄사, 호칭을 따라 하지 않는다. 위 캐릭터 설명의 말투만 쓴다.`,
      );
    }
  }
  if (persona.useMemory !== false) {
    rules.push(
      "[기억] 은 예전 대화에서 남긴 원문이다. 같은 사람에 대해 서로 다른 기억이 있으면 날짜가 최근인 것을 따른다.",
      '기억은 원래 알던 것처럼 자연스럽게 말한다. 답에 "[기억]" 같은 표기나 "기억에 따르면", "기록에 따르면" 같은 말을 쓰지 않는다.',
      "기억 원문을 따옴표로 옮기거나 기억에 붙은 날짜를 읊지 않는다. 날짜는 \"3일 후\" 같은 말을 계산하는 데만 쓰고, 알아낸 내용만 친구가 떠올리듯 말한다.",
    );
  }
  if (persona.useHelper !== false) {
    rules.push(
      "웹 검색, 오늘 날씨·환율·뉴스처럼 최신 정보, 확실히 모르는 사실이 필요할 때만 ask_helper 를 쓴다.",
      "잡담, 계산, 기억으로 답할 수 있는 질문에는 ask_helper 를 쓰지 않는다.",
      "ask_helper 질문에는 친구 이름, 대화 원문, 기억을 넣지 않는다. 그 문장만 읽어도 뜻이 통하는 짧은 질문 하나로 쓴다.",
      "도우미 답과 자기 지식이 확실하지 않은 사실은 덧붙이지 않는다.",
    );
  }
  return [intro, persona.character, ["## 답하는 규칙", ...rules.map((r) => `- ${r}`)].join("\n")].join("\n\n");
}
