// Couleurs d'identité des façades (doc 12) — canal séparé du statut des runs.
export const FACADE_COLORS: Record<string, string> = {
  bugfix: "#D85A30",
  discord: "#378ADD",
  demo: "#7F77DD",
  finish: "#1D9E75",
  seo: "#BA7517",
};

export const FACADE_LABELS: Record<string, string> = {
  bugfix: "Bugfix",
  discord: "Modifs",
  demo: "Démo",
  finish: "Site",
  seo: "SEO",
};

// Statut d'un run → pill sémantique (doc 12 : jamais la couleur de façade).
type StatusStyle = { label: string; classes: string; pulse?: boolean };

export const RUN_STATUS: Record<string, StatusStyle> = {
  queued: { label: "en file", classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  preparing: { label: "préparation", classes: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", pulse: true },
  running: { label: "en cours", classes: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", pulse: true },
  verifying: { label: "vérification", classes: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300", pulse: true },
  awaiting_approval: { label: "à confirmer", classes: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  approved: { label: "approuvé", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  pushed: { label: "publié", classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  rejected: { label: "refusé", classes: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500" },
  failed: { label: "échoué", classes: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  budget_exceeded: { label: "budget dépassé", classes: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
  timed_out: { label: "temps écoulé", classes: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export function statusOf(status: string): StatusStyle {
  return RUN_STATUS[status] ?? { label: status, classes: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
}
