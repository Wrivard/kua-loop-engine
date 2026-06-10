// Données de démonstration — utilisées tant que Supabase n'est pas configuré
// (cf. lib/supabase.ts `isSupabaseConfigured`). Permet de prévisualiser toute
// l'UI sans backend. Modélise la « journée type » de docs/12 : des projets à
// différents stades du cycle de vie (prospect → client mature).
//
// Bascule automatique sur le live dès que NEXT_PUBLIC_SUPABASE_* sont câblées :
// les fonctions de lib/queries.ts choisissent seed vs Supabase selon ce flag.

import type {
  InboxGroup,
  Loop,
  MessageWithRun,
  Project,
  RunRow,
  ThreadListItem,
  ThreadRow,
} from "@/lib/types";

// Horodatages fixes autour du 2026-06-10 (date courante du projet).
const T = {
  now: "2026-06-10T11:30:00-04:00",
  morning: "2026-06-10T08:15:00-04:00",
  lastNight: "2026-06-09T22:40:00-04:00",
  yesterdayPM: "2026-06-09T16:05:00-04:00",
  twoDays: "2026-06-08T14:00:00-04:00",
  earlyMonth: "2026-06-01T09:30:00-04:00",
  lastMonth: "2026-05-28T17:20:00-04:00",
};

// ---------------------------------------------------------------- projects ---

export const SEED_PROJECTS: Project[] = [
  {
    id: "salon-elegance",
    name: "Salon Élégance",
    repo_url: "github.com/kua/salon-elegance",
    default_branch: "main",
    plan: "premium",
    discord_channel_id: "1100000000000000001",
    sentry_project_slug: "salon-elegance",
    is_engine: false,
    created_at: "2026-03-15T10:00:00-04:00",
  },
  {
    id: "resto-local",
    name: "Resto Le Local",
    repo_url: "github.com/kua/resto-local",
    default_branch: "main",
    plan: "base",
    discord_channel_id: "1100000000000000002",
    sentry_project_slug: "resto-local",
    is_engine: false,
    created_at: "2026-04-02T10:00:00-04:00",
  },
  {
    id: "garage-precision",
    name: "Garage Précision",
    repo_url: "github.com/kua/garage-precision",
    default_branch: "main",
    plan: "base",
    discord_channel_id: "1100000000000000003",
    sentry_project_slug: null,
    is_engine: false,
    created_at: "2026-05-20T10:00:00-04:00",
  },
  {
    id: "cafe-mont-royal",
    name: "Café Mont-Royal",
    repo_url: "github.com/kua/cafe-mont-royal",
    default_branch: "main",
    plan: "base",
    discord_channel_id: null,
    sentry_project_slug: null,
    is_engine: false,
    created_at: "2026-06-09T18:00:00-04:00",
  },
  {
    id: "kua-loop-engine",
    name: "kua-loop-engine",
    repo_url: "github.com/kua/kua-loop-engine",
    default_branch: "main",
    plan: "base",
    discord_channel_id: "1100000000000000099",
    sentry_project_slug: "kua-loop-engine",
    is_engine: true,
    created_at: "2026-02-01T10:00:00-04:00",
  },
];

// ------------------------------------------------------------------- loops ---

function loop(
  id: string,
  project_id: string,
  facade: Loop["facade"],
  autonomy: Loop["autonomy"],
  extra: Partial<Loop> = {},
): Loop {
  return {
    id,
    project_id,
    facade,
    enabled: true,
    autonomy,
    schedule_cron: null,
    model: "claude-sonnet-4-6",
    max_iterations: 12,
    budget_usd: 5,
    timeout_min: 20,
    config: {},
    ...extra,
  };
}

export const SEED_LOOPS: Loop[] = [
  // Salon — client mature premium : 4 façades armées.
  loop("lp-salon-bugfix", "salon-elegance", "bugfix", "approve_final"),
  loop("lp-salon-discord", "salon-elegance", "discord", "approve_final"),
  loop("lp-salon-finish", "salon-elegance", "finish", "approve_final"),
  loop("lp-salon-seo", "salon-elegance", "seo", "manual", { schedule_cron: "0 9 1 * *" }),
  // Resto — client actif.
  loop("lp-resto-bugfix", "resto-local", "bugfix", "approve_final"),
  loop("lp-resto-discord", "resto-local", "discord", "approve_final"),
  // Garage — site en cours de finition.
  loop("lp-garage-finish", "garage-precision", "finish", "approve_final"),
  loop("lp-garage-bugfix", "garage-precision", "bugfix", "manual"),
  // Café — prospect : seulement la démo.
  loop("lp-cafe-demo", "cafe-mont-royal", "demo", "manual"),
  // Moteur (dogfooding) — toujours en revue humaine, jamais auto.
  loop("lp-engine-bugfix", "kua-loop-engine", "bugfix", "manual"),
  loop("lp-engine-discord", "kua-loop-engine", "discord", "manual"),
];

// ------------------------------------------------------------------- runs ---

function run(id: string, thread_id: string, extra: Partial<RunRow>): RunRow {
  return {
    id,
    thread_id,
    status: "awaiting_approval",
    goal: "",
    branch: null,
    pr_url: null,
    preview_url: null,
    cost_usd: null,
    iterations: null,
    log_path: null,
    summary: null,
    started_at: null,
    finished_at: null,
    created_at: T.now,
    ...extra,
  };
}

export const SEED_RUNS: RunRow[] = [
  run("rn-salon-cart", "th-salon-cart", {
    status: "awaiting_approval",
    goal: "Corriger la perte des articles du panier au rafraîchissement.",
    summary:
      "Le panier était gardé en mémoire React seulement. Maintenant persisté dans localStorage et restauré au montage. Testé sur Chrome/Safari.",
    branch: "fix/cart-persistence",
    pr_url: "github.com/kua/salon-elegance/pull/214",
    preview_url: "salon-elegance-fix-cart.preview.kua.quebec",
    cost_usd: 0.42,
    iterations: 4,
    started_at: T.lastNight,
    finished_at: T.lastNight,
    created_at: T.lastNight,
  }),
  run("rn-salon-promo", "th-salon-promo", {
    status: "running",
    goal: "Décaler la bannière de promo de la page d'accueil au 15 juin.",
    branch: "chore/promo-date",
    cost_usd: 0.08,
    iterations: 1,
    started_at: T.morning,
    created_at: T.morning,
  }),
  run("rn-salon-seo", "th-salon-seo", {
    status: "pushed",
    goal: "Générer le rapport SEO de mai et appliquer les quick-wins.",
    summary:
      "Rapport mai livré : +12 % de trafic organique. 3 quick-wins appliqués (balises title, alt d'images, maillage interne).",
    pr_url: "github.com/kua/salon-elegance/pull/201",
    cost_usd: 1.85,
    iterations: 9,
    started_at: T.earlyMonth,
    finished_at: T.earlyMonth,
    created_at: T.earlyMonth,
  }),
  run("rn-salon-stripe", "th-salon-stripe", {
    status: "pushed",
    goal: "Corriger l'erreur 500 au checkout Stripe.",
    summary: "Clé API Stripe expirée côté serveur ; rotation + garde-fou ajouté.",
    pr_url: "github.com/kua/salon-elegance/pull/195",
    cost_usd: 0.55,
    iterations: 5,
    started_at: T.lastMonth,
    finished_at: T.lastMonth,
    created_at: T.lastMonth,
  }),
  run("rn-resto-hero", "th-resto-hero", {
    status: "awaiting_approval",
    goal: "Remplacer la photo du hero par la nouvelle (terrasse été).",
    summary: "Nouvelle photo intégrée, recadrée 16:9 et optimisée en WebP (−240 ko).",
    preview_url: "resto-local-hero.preview.kua.quebec",
    branch: "content/hero-terrasse",
    cost_usd: 0.18,
    iterations: 2,
    started_at: T.morning,
    finished_at: T.morning,
    created_at: T.morning,
  }),
  run("rn-resto-form", "th-resto-form", {
    status: "running",
    goal: "Réparer l'envoi du courriel de confirmation de réservation.",
    cost_usd: 0.12,
    iterations: 2,
    started_at: T.now,
    created_at: T.now,
  }),
  run("rn-garage-lot3", "th-garage-lot3", {
    status: "awaiting_approval",
    goal: "Générer le lot 3 du site — pages services.",
    summary:
      "5 pages services générées et liées au menu. ⚠️ 1 TODO-CLIENT sur /services/transmission (texte technique manquant).",
    pr_url: "github.com/kua/garage-precision/pull/42",
    preview_url: "garage-precision-lot3.preview.kua.quebec",
    branch: "site/lot-3-services",
    cost_usd: 1.1,
    iterations: 8,
    started_at: T.yesterdayPM,
    finished_at: T.yesterdayPM,
    created_at: T.yesterdayPM,
  }),
  run("rn-garage-lot2", "th-garage-lot2", {
    status: "pushed",
    goal: "Générer le lot 2 — pages équipe & contact.",
    summary: "2 pages livrées et publiées.",
    pr_url: "github.com/kua/garage-precision/pull/38",
    cost_usd: 0.74,
    iterations: 6,
    started_at: T.lastMonth,
    finished_at: T.lastMonth,
    created_at: T.lastMonth,
  }),
  run("rn-cafe-demo", "th-cafe-demo", {
    status: "awaiting_approval",
    goal: "Construire une démo de site vitrine (3 pages) pour le prospect.",
    summary:
      "Démo prête : accueil, menu, contact. Design chaleureux (palette café/crème). Prête à envoyer au prospect.",
    preview_url: "cafe-mont-royal-demo.preview.kua.quebec",
    branch: "demo/initial",
    cost_usd: 0.65,
    iterations: 7,
    started_at: T.yesterdayPM,
    finished_at: T.yesterdayPM,
    created_at: T.yesterdayPM,
  }),
  run("rn-engine-yaml", "th-engine-yaml", {
    status: "running",
    goal: "Corriger le parse de loops.yaml qui ignore les commentaires inline.",
    cost_usd: 0.05,
    iterations: 1,
    started_at: T.now,
    created_at: T.now,
  }),
];

// ----------------------------------------------------------------- threads ---

function thread(
  id: string,
  project_id: string,
  facade: ThreadRow["facade"],
  subject: string,
  status: ThreadRow["status"],
  loop_id: string,
  last_activity_at: string,
  extra: Partial<ThreadRow> = {},
): ThreadRow {
  return {
    id,
    project_id,
    loop_id,
    facade,
    subject,
    status,
    source_event_id: null,
    created_at: last_activity_at,
    last_activity_at,
    resolved_at: null,
    archived_at: null,
    ...extra,
  };
}

export const SEED_THREADS: ThreadRow[] = [
  // Salon Élégance
  thread("th-salon-cart", "salon-elegance", "bugfix", "Le panier perd les articles au rafraîchissement", "awaiting_approval", "lp-salon-bugfix", T.lastNight),
  thread("th-salon-promo", "salon-elegance", "discord", "Décaler la bannière de promo au 15 juin", "working", "lp-salon-discord", T.morning),
  thread("th-salon-seo", "salon-elegance", "seo", "Rapport SEO — mai", "resolved", "lp-salon-seo", T.earlyMonth, { resolved_at: T.earlyMonth }),
  thread("th-salon-stripe", "salon-elegance", "bugfix", "Erreur 500 au checkout Stripe", "archived", "lp-salon-bugfix", T.lastMonth, { resolved_at: T.lastMonth, archived_at: T.lastMonth }),
  // Resto Le Local
  thread("th-resto-hero", "resto-local", "discord", "Changer la photo du hero", "awaiting_approval", "lp-resto-discord", T.morning),
  thread("th-resto-form", "resto-local", "bugfix", "Le formulaire de réservation n'envoie pas le courriel", "working", "lp-resto-bugfix", T.now),
  // Garage Précision
  thread("th-garage-lot3", "garage-precision", "finish", "Lot 3 — pages services", "awaiting_approval", "lp-garage-finish", T.yesterdayPM),
  thread("th-garage-lot2", "garage-precision", "finish", "Lot 2 — pages équipe & contact", "archived", "lp-garage-finish", T.lastMonth, { resolved_at: T.lastMonth, archived_at: T.lastMonth }),
  // Café Mont-Royal (prospect)
  thread("th-cafe-demo", "cafe-mont-royal", "demo", "Démo — site vitrine", "awaiting_approval", "lp-cafe-demo", T.yesterdayPM),
  // Moteur (dogfooding)
  thread("th-engine-yaml", "kua-loop-engine", "bugfix", "Le parse de loops.yaml ignore les commentaires", "working", "lp-engine-bugfix", T.now),
];

// ---------------------------------------------------------------- messages ---
// Conversations détaillées pour les fils-vedettes. Les autres sont synthétisées
// depuis leurs runs (cf. seedThreadMessages).

type SeedMessage = {
  id: string;
  thread_id: string;
  role: MessageWithRun["role"];
  author: string | null;
  content: string | null;
  run_id: string | null;
  created_at: string;
};

const SEED_MESSAGES: SeedMessage[] = [
  // Salon — panier (bug Sentry → run → à confirmer)
  { id: "m-salon-cart-1", thread_id: "th-salon-cart", role: "system", author: null, content: "Conversation ouverte depuis un événement Sentry (CartContext, 23 occurrences).", run_id: null, created_at: "2026-06-09T22:35:00-04:00" },
  { id: "m-salon-cart-2", thread_id: "th-salon-cart", role: "agent", author: "Agent Bugfix", content: "Bug reproduit : le panier vit seulement en mémoire React, il se vide au rafraîchissement. Je lance un run pour le persister.", run_id: null, created_at: "2026-06-09T22:36:00-04:00" },
  { id: "m-salon-cart-3", thread_id: "th-salon-cart", role: "run", author: null, content: null, run_id: "rn-salon-cart", created_at: T.lastNight },

  // Garage — lot 3 avec TODO-CLIENT (chemin nuancé de la journée type)
  { id: "m-garage-1", thread_id: "th-garage-lot3", role: "agent", author: "Agent Site", content: "Lot 3 prêt : 5 pages services générées et reliées au menu.", run_id: null, created_at: T.yesterdayPM },
  { id: "m-garage-2", thread_id: "th-garage-lot3", role: "run", author: null, content: null, run_id: "rn-garage-lot3", created_at: T.yesterdayPM },
  { id: "m-garage-3", thread_id: "th-garage-lot3", role: "user", author: "wrivard@kua.quebec", content: "La page transmission a un TODO-CLIENT. Mets un texte générique en attendant qu'on ait le vrai contenu du client.", run_id: null, created_at: "2026-06-09T16:30:00-04:00" },
  { id: "m-garage-4", thread_id: "th-garage-lot3", role: "agent", author: "Agent Site", content: "Compris. Je remplace le TODO par un paragraphe générique « En savoir plus, contactez-nous ». Je relance un run dès que tu confirmes, ou tu peux confirmer le lot tel quel.", run_id: null, created_at: "2026-06-09T16:32:00-04:00" },

  // Café — démo prospect
  { id: "m-cafe-1", thread_id: "th-cafe-demo", role: "system", author: null, content: "Conversation ouverte depuis un événement calendrier (meeting booké par le cold-caller).", run_id: null, created_at: "2026-06-09T15:00:00-04:00" },
  { id: "m-cafe-2", thread_id: "th-cafe-demo", role: "agent", author: "Agent Démo", content: "Démo de site vitrine en 3 pages générée pour le prospect. Aperçu prêt à envoyer.", run_id: null, created_at: T.yesterdayPM },
  { id: "m-cafe-3", thread_id: "th-cafe-demo", role: "run", author: null, content: null, run_id: "rn-cafe-demo", created_at: T.yesterdayPM },

  // Resto — hero
  { id: "m-resto-hero-1", thread_id: "th-resto-hero", role: "user", author: "wrivard@kua.quebec", content: "Peux-tu mettre la nouvelle photo de la terrasse en hero ?", run_id: null, created_at: "2026-06-10T08:00:00-04:00" },
  { id: "m-resto-hero-2", thread_id: "th-resto-hero", role: "run", author: null, content: null, run_id: "rn-resto-hero", created_at: T.morning },
];

// ----------------------------------------------------------------- accessors ---

function runsForThread(threadId: string): RunRow[] {
  return SEED_RUNS.filter((r) => r.thread_id === threadId).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

function latestRunFor(threadId: string): RunRow | null {
  const runs = runsForThread(threadId);
  return runs.length ? runs[runs.length - 1] : null;
}

function toListItem(t: ThreadRow): ThreadListItem {
  const run = latestRunFor(t.id);
  return {
    ...t,
    latest_run: run
      ? {
          id: run.id,
          status: run.status,
          cost_usd: run.cost_usd,
          pr_url: run.pr_url,
          preview_url: run.preview_url,
        }
      : null,
    last_message_preview: run?.summary ?? null,
  };
}

export function seedProjects(): Project[] {
  return [...SEED_PROJECTS].sort((a, b) => a.name.localeCompare(b.name));
}

export function seedProjectById(id: string): Project | null {
  return SEED_PROJECTS.find((p) => p.id === id) ?? null;
}

export function seedLoopsByProject(projectId: string): Loop[] {
  return SEED_LOOPS.filter((l) => l.project_id === projectId);
}

export function seedInboxGroups(): InboxGroup[] {
  const awaiting = SEED_THREADS.filter((t) => t.status === "awaiting_approval").sort((a, b) =>
    b.last_activity_at.localeCompare(a.last_activity_at),
  );
  const groups = new Map<string, InboxGroup>();
  for (const t of awaiting) {
    const proj = seedProjectById(t.project_id ?? "") ?? {
      id: t.project_id ?? "—",
      name: "Sans projet",
      plan: "base" as const,
    };
    if (!groups.has(proj.id)) {
      groups.set(proj.id, { project: { id: proj.id, name: proj.name, plan: proj.plan }, threads: [] });
    }
    groups.get(proj.id)!.threads.push(toListItem(t));
  }
  return [...groups.values()];
}

export function seedThreadsByProject(projectId: string): ThreadListItem[] {
  return SEED_THREADS.filter((t) => t.project_id === projectId)
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
    .map(toListItem);
}

export function seedThread(threadId: string): ThreadRow | null {
  return SEED_THREADS.find((t) => t.id === threadId) ?? null;
}

export function seedThreadMessages(threadId: string): MessageWithRun[] {
  const explicit = SEED_MESSAGES.filter((m) => m.thread_id === threadId);
  const resolve = (m: SeedMessage): MessageWithRun => ({
    id: m.id,
    thread_id: m.thread_id,
    role: m.role,
    author: m.author,
    content: m.content,
    run_id: m.run_id,
    created_at: m.created_at,
    run: m.run_id ? SEED_RUNS.find((r) => r.id === m.run_id) ?? null : null,
  });
  if (explicit.length) {
    return explicit
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(resolve);
  }
  // Fallback : synthétise une intro d'agent + une carte par run.
  const t = seedThread(threadId);
  const runs = runsForThread(threadId);
  const synth: MessageWithRun[] = [];
  if (t) {
    synth.push({
      id: `${threadId}-intro`,
      thread_id: threadId,
      role: "agent",
      author: "Agent",
      content: runs[0]?.goal ?? t.subject,
      run_id: null,
      created_at: t.created_at,
      run: null,
    });
  }
  for (const r of runs) {
    synth.push({
      id: `${r.id}-msg`,
      thread_id: threadId,
      role: "run",
      author: null,
      content: null,
      run_id: r.id,
      created_at: r.created_at,
      run: r,
    });
  }
  return synth;
}

export function seedRunsByThread(threadId: string): RunRow[] {
  return runsForThread(threadId);
}

export function seedMonthCost(projectId: string): number {
  const threadIds = new Set(
    SEED_THREADS.filter((t) => t.project_id === projectId).map((t) => t.id),
  );
  return SEED_RUNS.filter((r) => threadIds.has(r.thread_id)).reduce(
    (sum, r) => sum + (r.cost_usd ? Number(r.cost_usd) : 0),
    0,
  );
}
