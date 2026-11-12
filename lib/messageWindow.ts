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
 * full 이 false 면(구독 창이 다 차지 않음) 컬렉션 전체가 창 안에 있다는 뜻이라 밀려난 메시지가 있을 수 없다.
 * 이때 사라진 메시지는 지워진 것이므로 older 와 함께 비운다(/clear 등).
 */
export function applySnapshot<T extends WindowItem>(
  prev: MessageWindow<T>,
  nextLatest: T[],
  full: boolean = true,
): MessageWindow<T> {
  if (!full) return { older: [], latest: nextLatest };
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

export type Stamp = { seconds: number; nanoseconds: number };

/** 구독 결과 문서 하나. pending 은 서버 확정 전(내가 방금 보낸 메시지)인지. */
export type SnapshotDoc<T> = { item: T; pending: boolean; createdAt: Stamp | null };

function after(a: Stamp, b: Stamp): boolean {
  return a.seconds !== b.seconds ? a.seconds > b.seconds : a.nanoseconds > b.nanoseconds;
}

/**
 * 실시간 구독 결과(최신 순)에서 /clear 이후 것만 남긴다. 서버 확정 전 메시지와 시각을 모르는 메시지는 남긴다.
 * full 은 구독 창이 다 찼는지다. 하나라도 걸러졌으면 창이 지운 시각에 닿았으므로 false 다.
 */
export function visibleAfterCleared<T>(
  docs: readonly SnapshotDoc<T>[],
  clearedAt: Stamp | null,
  pageSize: number,
): { items: T[]; full: boolean } {
  const kept = clearedAt
    ? docs.filter((d) => d.pending || d.createdAt === null || after(d.createdAt, clearedAt))
    : docs;
  return { items: kept.map((d) => d.item), full: kept.length === docs.length && docs.length === pageSize };
}
