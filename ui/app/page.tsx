import { AppShell } from "@/components/app-shell";
import { BrainJournal } from "@/components/composer/brain-journal";

// Accueil = journal de la conversation globale ; la saisie vit dans le dock omniprésent.
export default function Home() {
  return (
    <AppShell>
      <BrainJournal />
    </AppShell>
  );
}
