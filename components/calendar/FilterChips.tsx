import { FILTER_GROUPS, GROUP_COLOR, type FilterGroup } from "@/lib/calendar/events";

/** 종류 묶음 칩 넷. 켜진 칩은 옅은 바탕에 묶음 색 점, 꺼진 칩은 테두리만 보인다. */
export function FilterChips({ on, onToggle }: { on: readonly FilterGroup[]; onToggle: (key: FilterGroup) => void }) {
  return (
    <ul className="flex gap-1.5 overflow-x-auto" aria-label="일정 종류">
      {FILTER_GROUPS.map((g) => {
        const active = on.includes(g.key);
        return (
          <li key={g.key} className="shrink-0">
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(g.key)}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs ${
                active ? "border-zinc-100 bg-zinc-100 font-bold text-zinc-900" : "border-zinc-200 bg-white text-zinc-400"
              }`}
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? GROUP_COLOR[g.key].dot : "bg-zinc-300"}`} />
              {g.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
