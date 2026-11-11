export function ConnectionBanner({ offline }: { offline: boolean }) {
  if (!offline) return null;
  return <div className="bg-amber-100 px-4 py-1 text-center text-xs text-amber-800">연결 끊김</div>;
}
