import { NicknameGate } from "@/components/auth/NicknameGate";
import { AppShell } from "@/components/shell/AppShell";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <NicknameGate>
      <AppShell>{children}</AppShell>
    </NicknameGate>
  );
}
