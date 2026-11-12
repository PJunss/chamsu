export function BotAvatar({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" />
  );
}
