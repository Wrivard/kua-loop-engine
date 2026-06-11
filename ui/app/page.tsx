import { AppShell } from "@/components/app-shell";
import { GlobalChat } from "@/components/global-chat";

// Accueil chat-first : le composer conversationnel est l'interface par défaut.
export default function Home() {
  return (
    <AppShell>
      <GlobalChat />
    </AppShell>
  );
}
