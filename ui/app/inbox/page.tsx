import { AppShell } from "@/components/app-shell";
import { InboxView } from "@/components/inbox-view";

// L'inbox (approbations) reste accessible en navigation ; l'accueil est devenu le chat.
export default function InboxPage() {
  return (
    <AppShell>
      <InboxView />
    </AppShell>
  );
}
