"use client";

export function ChatContainer({ nickname }: { uid: string; nickname: string }) {
  return <p className="p-4">{nickname}</p>;
}
