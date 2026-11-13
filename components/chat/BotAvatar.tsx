/** 페르소나 아바타. size 는 한 변의 px 다. */
export function BotAvatar({ src, alt, size = 36 }: { src: string; alt: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  );
}
