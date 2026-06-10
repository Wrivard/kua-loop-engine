import { AppShell } from "@/components/app-shell";
import { InboxView } from "@/components/inbox-view";

export default function Home() {
  return (
    <AppShell>
      <InboxView />
    </AppShell>
  );
}
