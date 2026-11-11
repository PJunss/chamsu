import type { OnlineUser } from "@/lib/presence";

export function PresenceList({ online, me }: { online: OnlineUser[]; me: string }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {online.map((u) => (
        <li key={u.uid} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span>{u.nickname}</span>
          {u.uid === me && <span className="text-xs text-zinc-400">(나)</span>}
        </li>
      ))}
    </ul>
  );
}
