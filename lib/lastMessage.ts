export type LastMessage = { uid: string; text: string; createdAt: Date | null };

const EMPTY_PREVIEW = "대화를 시작해 보세요";

/** 채팅방 목록에 보일 마지막 메시지 한 줄. 내가 쓴 것은 "나: " 를 붙이고, 줄바꿈은 공백으로 잇는다. */
export function lastMessagePreview(message: Pick<LastMessage, "uid" | "text"> | null, me: string): string {
  if (!message) return EMPTY_PREVIEW;
  const text = message.text.replace(/\s+/g, " ").trim();
  return message.uid === me ? `나: ${text}` : text;
}

const seoulParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoul(d: Date) {
  const p = Object.fromEntries(seoulParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), time: `${p.hour}:${p.minute}` };
}

/** 한국 날짜 기준 일 번호. 날짜 차이를 세는 데만 쓴다. */
const dayNumber = (x: { year: number; month: number; day: number }) => Math.floor(Date.UTC(x.year, x.month - 1, x.day) / 86_400_000);

/**
 * 채팅방 목록에 보일 마지막 메시지 시각(한국 시간). 오늘이면 "21:03", 어제면 "어제",
 * 올해면 "11.9", 그보다 전이면 "2025.12.31". 시각을 모르면 빈 문자열.
 */
export function lastMessageTime(at: Date | null, now: Date): string {
  if (!at) return "";
  const a = seoul(at);
  const n = seoul(now);
  const diff = dayNumber(n) - dayNumber(a);
  if (diff <= 0) return a.time;
  if (diff === 1) return "어제";
  return a.year === n.year ? `${a.month}.${a.day}` : `${a.year}.${a.month}.${a.day}`;
}
