import { Bug, MessageSquare, Sparkles, LayoutTemplate, Search, type LucideIcon } from "lucide-react";
import type { Facade, RunStatus, ThreadStatus } from "@/lib/types";

// Couleurs d'identité des façades (doc 12) — canal séparé du statut des runs.
export const FACADE_COLORS: Record<Facade, string> = {
  bugfix: "#D85A30",
  discord: "#378ADD",
  demo: "#7F77DD",
  finish: "#1D9E75",
  seo: "#BA7517",
};

// Labels FR (doc 12 : Bugfix / Modifs / Démo / Site / SEO).
export const FACADE_LABELS: Record<Facade, string> = {
  bugfix: "Bugfix",
  discord: "Modifs",
  demo: "Démo",
  finish: "Site",
  seo: "SEO",
};

// Ordre d'affichage canonique (cycle de vie : démo → site → bugfix/modifs → seo).
export const FACADE_ORDER: Facade[] = ["demo", "finish", "bugfix", "discord", "seo"];

export const FACADE_ICONS: Record<Facade, LucideIcon> = {
  bugfix: Bug,
  discord: MessageSquare,
  demo: Sparkles,
  finish: LayoutTemplate,
  seo: Search,
};

export function facadeColor(facade: string): string {
  return FACADE_COLORS[facade as Facade] ?? "hsl(var(--muted-foreground))";
}

export function facadeLabel(facade: string): string {
  return FACADE_LABELS[facade as Facade] ?? facade;
}

// Statut d'un run → pill sémantique (doc 12 : jamais la couleur de façade).
type StatusStyle = { label: string; classes: string; pulse?: boolean };

export const RUN_STATUS: Record<RunStatus, StatusStyle> = {
  queued: { label: "en file", classes: "bg-muted text-muted-foreground" },
  preparing: { label: "préparation", classes: "bg-blue-500/10 text-blue-500", pulse: true },
  running: { label: "en cours", classes: "bg-blue-500/10 text-blue-500", pulse: true },
  verifying: { label: "vérification", classes: "bg-blue-500/10 text-blue-500", pulse: true },
  awaiting_approval: { label: "à confirmer", classes: "bg-amber-500/10 text-amber-500" },
  approved: { label: "approuvé", classes: "bg-emerald-500/10 text-emerald-500" },
  pushed: { label: "publié", classes: "bg-emerald-500/10 text-emerald-500" },
  rejected: { label: "refusé", classes: "bg-muted text-muted-foreground" },
  failed: { label: "échoué", classes: "bg-red-500/10 text-red-500" },
  budget_exceeded: { label: "budget dépassé", classes: "bg-red-500/10 text-red-500" },
  timed_out: { label: "temps écoulé", classes: "bg-red-500/10 text-red-500" },
};

export function statusOf(status: string): StatusStyle {
  return (
    RUN_STATUS[status as RunStatus] ?? { label: status, classes: "bg-muted text-muted-foreground" }
  );
}

// Libellé court d'un statut de thread (pour les listes de conversations).
export const THREAD_STATUS_LABEL: Record<ThreadStatus, string> = {
  open: "ouvert",
  working: "en cours",
  awaiting_approval: "à confirmer",
  resolved: "réglé",
  rejected: "refusé",
  failed: "échoué",
  archived: "archivé",
};

export const ACTIVE_THREAD_STATUSES: ThreadStatus[] = [
  "open",
  "working",
  "awaiting_approval",
];
