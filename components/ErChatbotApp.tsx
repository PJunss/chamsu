"use client";

import { useCallback, useState } from "react";
import { Keypad } from "@/components/keypad/Keypad";
import { NicknameForm } from "@/components/nickname/NicknameForm";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { checkPin, join } from "@/lib/enterApi";

type Stage =
  | { name: "pin" }
  | { name: "nickname"; pin: string }
  | { name: "chat"; uid: string; nickname: string };

export function ErChatbotApp() {
  const [stage, setStage] = useState<Stage>({ name: "pin" });

  const submitPin = useCallback(async (pin: string) => {
    const result = await checkPin(pin);
    if (result === "ok") setStage({ name: "nickname", pin });
    return result;
  }, []);

  const submitNickname = useCallback(
    async (nickname: string) => {
      if (stage.name !== "nickname") return { kind: "error" } as const;
      const result = await join(stage.pin, nickname);
      if (result.kind === "ok") setStage({ name: "chat", uid: result.uid, nickname: result.nickname });
      if (result.kind === "wrong_pin") setStage({ name: "pin" });
      return result;
    },
    [stage],
  );

  if (stage.name === "chat") return <ChatContainer uid={stage.uid} nickname={stage.nickname} />;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 scale-110 bg-[url('/home.jpeg')] bg-cover bg-center blur-md"
      />
      <div className="relative">
        {stage.name === "pin" ? <Keypad onSubmit={submitPin} /> : <NicknameForm onSubmit={submitNickname} />}
      </div>
    </main>
  );
}
