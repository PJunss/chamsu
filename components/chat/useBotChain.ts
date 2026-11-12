"use client";

import { useEffect, useRef } from "react";
import { BOT_CHAIN_MAX } from "@/lib/claude/constants";
import { PERSONAS, findMentions, isBotUid, type PersonaInfo } from "@/lib/claude/personas/info";

type ChainCandidate = {
  id: string;
  text: string;
  uid: string;
  createdAt: Date | null;
  chainDepth?: number;
  chainRootUid?: string;
};

/**
 * 이어서 다른 봇을 불러야 하는 봇 메시지 id 들. seen 에 없고 after(ms) 보다 나중에 만들어진 메시지 중
 * 내가 시작한 연쇄(chainRootUid)이고, 단계가 BOT_CHAIN_MAX 이하이고, 자기 말고 다른 봇을 부른 것만 고른다.
 */
export function pickChainCalls(
  messages: readonly ChainCandidate[],
  seen: ReadonlySet<string>,
  myUid: string,
  after: number,
  list: readonly PersonaInfo[] = PERSONAS,
): string[] {
  return messages
    .filter(
      (m) =>
        !seen.has(m.id) &&
        m.createdAt !== null &&
        m.createdAt.getTime() > after &&
        isBotUid(m.uid, list) &&
        m.chainRootUid === myUid &&
        typeof m.chainDepth === "number" &&
        m.chainDepth <= BOT_CHAIN_MAX &&
        findMentions(m.text, list).some((p) => p.uid !== m.uid),
    )
    .map((m) => m.id);
}

/** 이 창이 처음 받은 메시지 중 가장 늦은 시각(ms). 비어 있으면 -Infinity. */
function latestMs(messages: readonly ChainCandidate[]): number {
  let max = -Infinity;
  for (const m of messages) if (m.createdAt && m.createdAt.getTime() > max) max = m.createdAt.getTime();
  return max;
}

/**
 * 단체방에서 이 창이 연 뒤 새로 들어온 봇 메시지가 내 연쇄의 다른 봇을 부르면 call(messageId) 를 한 번씩 부른다.
 * 서버 스냅샷을 처음 받았을 때 있던 메시지(창을 열기 전 메시지)와 그보다 이른 메시지는 부르지 않는다.
 * 방을 바꾸면 기억한 메시지를 비운다.
 */
export function useBotChain(
  roomId: string,
  isGroup: boolean,
  messages: readonly ChainCandidate[],
  synced: boolean,
  myUid: string,
  call: (messageId: string) => void,
) {
  const state = useRef<{ roomId: string; seen: Set<string>; after: number } | null>(null);

  useEffect(() => {
    if (state.current && state.current.roomId !== roomId) state.current = null;
    if (!isGroup || !synced) return;
    if (!state.current) {
      state.current = {
        roomId,
        seen: new Set(messages.filter((m) => m.createdAt !== null).map((m) => m.id)),
        after: latestMs(messages),
      };
      return;
    }
    const s = state.current;
    const calls = pickChainCalls(messages, s.seen, myUid, s.after);
    for (const m of messages) if (m.createdAt !== null) s.seen.add(m.id);
    for (const id of calls) call(id);
  }, [roomId, isGroup, synced, messages, myUid, call]);
}
