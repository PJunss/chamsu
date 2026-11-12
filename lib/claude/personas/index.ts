import type { PersonaInfo } from "./info";
import { bianca } from "./bianca/persona";
import { lucia } from "./lucia/persona";

/** 서버 전용 페르소나 목록. 프롬프트가 브라우저 번들에 들어가지 않도록 브라우저 컴포넌트에서 import 하지 않는다. */
export type ReplyText = { refused: string; userLimited: string; dailyLimited: string; failed: string; empty: string };

export type PersonaConfig = {
  info: PersonaInfo;
  /** 캐릭터와 말투 설명. 방 소개와 공통 규칙은 엔진이 붙인다. */
  character: string;
  /** 제한·실패 안내를 그 캐릭터 말투로 쓴 문구 */
  replyText: ReplyText;
  model?: string;
  maxSentences?: number;
  useHelper?: boolean;
  useMemory?: boolean;
};

export const PERSONA_CONFIGS: readonly PersonaConfig[] = [bianca, lucia];

export function getPersonaConfig(id: string): PersonaConfig | null {
  return PERSONA_CONFIGS.find((c) => c.info.id === id) ?? null;
}
