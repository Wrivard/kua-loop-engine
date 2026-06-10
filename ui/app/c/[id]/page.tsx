import { AppShell } from "@/components/app-shell";
import { ConversationView } from "@/components/conversation-view";

export default function ConversationPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <ConversationView threadId={params.id} />
    </AppShell>
  );
}
