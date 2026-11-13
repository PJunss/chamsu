import { GROUP_COLOR, groupOf, kindText, whenText, type CalendarEvent } from "@/lib/calendar/events";

type Props = {
  events: readonly CalendarEvent[];
  now: Date;
  /** 고치는 중인 일정의 id. */
  editingId: string | null;
  onEdit: (e: CalendarEvent) => void;
  onRemove: (e: CalendarEvent) => void;
};

const ICON = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function SourceBadge({ event }: { event: CalendarEvent }) {
  return <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{event.source ?? "-"}</span>;
}

/** 줄 오른쪽의 동작. ER API 에서 온 일정은 자물쇠만 보이고, 그 밖은 고치기·지우기 버튼이다. */
function RowActions({ event, onEdit, onRemove }: { event: CalendarEvent; onEdit: Props["onEdit"]; onRemove: Props["onRemove"] }) {
  if (event.source === "er-api") {
    return (
      <span className="flex h-8 w-8 items-center justify-center text-zinc-400" role="img" aria-label="고칠 수 없는 일정">
        <svg {...ICON} aria-hidden>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" onClick={() => onEdit(event)} aria-label={`${event.title} 고치기`} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100">
        <svg {...ICON} aria-hidden>
          <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
        </svg>
      </button>
      <button type="button" onClick={() => onRemove(event)} aria-label={`${event.title} 지우기`} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100">
        <svg {...ICON} aria-hidden>
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
        </svg>
      </button>
    </span>
  );
}

/** 관리자 일정 목록. 휴대폰은 줄마다 두 줄 묶음, 데스크톱은 표로 보인다. */
export function AdminEventList({ events, now, editingId, onEdit, onRemove }: Props) {
  if (events.length === 0) return <p className="py-6 text-sm text-zinc-500">일정이 없습니다</p>;
  return (
    <>
      <ul className="divide-y divide-zinc-200 md:hidden">
        {events.map((e) => (
          <li key={e.id} className={`flex items-center gap-3 py-3 ${e.id === editingId ? "bg-zinc-50" : ""}`}>
            <span aria-hidden className={`h-9 w-[3px] shrink-0 rounded-full ${GROUP_COLOR[groupOf(e)].dot}`} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-bold text-zinc-900">{e.title}</span>
                <SourceBadge event={e} />
              </span>
              <span className="truncate text-xs text-zinc-500">
                {kindText(e)} · {whenText(e, now)}
              </span>
            </span>
            <RowActions event={e} onEdit={onEdit} onRemove={onRemove} />
          </li>
        ))}
      </ul>

      <table className="hidden w-full table-fixed text-left text-sm md:table">
        <thead>
          <tr className="text-xs text-zinc-400">
            <th className="w-[90px] px-2 py-2 font-normal">종류</th>
            <th className="px-2 py-2 font-normal">제목</th>
            <th className="w-[260px] px-2 py-2 font-normal">시각</th>
            <th className="w-[70px] px-2 py-2 font-normal">출처</th>
            <th className="w-[72px] px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className={`border-b border-zinc-200 ${e.id === editingId ? "bg-zinc-100" : ""}`}>
              <td className="px-2 py-2">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${GROUP_COLOR[groupOf(e)].dot}`} />
                  {kindText(e)}
                </span>
              </td>
              <td className="truncate px-2 py-2 font-bold text-zinc-900">{e.title}</td>
              <td className="truncate px-2 py-2 text-zinc-500">{whenText(e, now)}</td>
              <td className="px-2 py-2">
                <SourceBadge event={e} />
              </td>
              <td className="px-2 py-1">
                <RowActions event={e} onEdit={onEdit} onRemove={onRemove} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
