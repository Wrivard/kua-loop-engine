import { AppShell } from "@/components/app-shell";
import { ActivityView } from "@/components/activity-view";

// Activité (job SURVEILLER) : santé moteur + pause, coûts, ce qui roule.
export default function ActivityPage() {
  return (
    <AppShell>
      <ActivityView />
    </AppShell>
  );
}
