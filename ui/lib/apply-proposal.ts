import { createLoop, createThread, ensureLoop } from "@/lib/queries";
import { currentIdentity } from "@/lib/auth";
import type { ConfirmedProposal } from "@/components/proposal-card";

// Exécute une proposition CONFIRMÉE (chat ou inbox) : crée le thread/loop (chemin Supabase
// existant) ou applique une action de gestion (allowlist serveur /api/agent/act). Source de
// vérité unique partagée par BrainChat et l'inbox de propositions.
export async function applyProposal(
  p: ConfirmedProposal,
): Promise<{ kind: "thread" | "loop" | "project" | "act"; id: string } | null> {
  if (p.action === "create_thread" && p.project_id) {
    const loopId = await ensureLoop(p.project_id, p.facade);
    const author = await currentIdentity();
    const tid = await createThread(p.project_id, p.facade, loopId, p.title, p.goal, author);
    return tid ? { kind: "thread", id: tid } : null;
  }
  if (p.action === "create_loop" && p.project_id) {
    await createLoop(p.project_id, p.facade, { budget_usd: p.budget_usd });
    return { kind: "loop", id: p.project_id }; // navigue vers le projet
  }
  if (p.action === "import_repo") {
    const r = await fetch("/api/repo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: p.repo, facade: p.facade, budget_usd: p.budget_usd }),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok && data?.slug ? { kind: "project", id: data.slug } : null;
  }
  // update_loop / pause_loop / resume_loop → allowlist SERVEUR.
  const r = await fetch("/api/agent/act", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: p.action, loop_id: p.loop_id, patch: { budget_usd: p.budget_usd, title: p.title } }),
  });
  return r.ok ? { kind: "act", id: p.loop_id ?? "" } : null;
}
