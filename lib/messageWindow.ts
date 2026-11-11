export type WindowItem = { id: string; createdAt: Date | null };

/** older 는 실시간 구독 창 밖의 메시지, latest 는 구독 중인 최신 창. 둘 다 오래된 순. */
export type MessageWindow<T extends WindowItem> = { older: T[]; latest: T[] };

const time = (m: WindowItem) => (m.createdAt ? m.createdAt.getTime() : Number.POSITIVE_INFINITY);

function dedupe<T extends WindowItem>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

/**
 * 새 구독 결과를 반영한다. 직전 latest 에 있다가 새 창의 가장 오래된 메시지보다 오래돼
 * 창 밖으로 밀려난 메시지는 older 끝으로 옮겨 목록에 남긴다.
 */
export function applySnapshot<T extends WindowItem>(prev: MessageWindow<T>, nextLatest: T[]): MessageWindow<T> {
  const nextIds = new Set(nextLatest.map((m) => m.id));
  const oldest = nextLatest.length > 0 ? time(nextLatest[0]) : Number.POSITIVE_INFINITY;
  const pushedOut = prev.latest.filter((m) => !nextIds.has(m.id) && time(m) < oldest);
  const older = dedupe([...prev.older, ...pushedOut]).filter((m) => !nextIds.has(m.id));
  return { older, latest: nextLatest };
}

/** 한 번 읽은 이전 페이지(오래된 순)를 older 앞에 붙인다. */
export function prependOlder<T extends WindowItem>(prev: MessageWindow<T>, page: T[]): MessageWindow<T> {
  const latestIds = new Set(prev.latest.map((m) => m.id));
  return { older: dedupe([...page, ...prev.older]).filter((m) => !latestIds.has(m.id)), latest: prev.latest };
}

/** 화면에 보일 전체 목록. 오래된 순, 중복 없음. */
export function mergeWindow<T extends WindowItem>(w: MessageWindow<T>): T[] {
  return dedupe([...w.older, ...w.latest]);
}
