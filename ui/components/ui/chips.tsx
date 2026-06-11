import {
  GitBranch,
  GitPullRequest,
  MessageSquare,
  Clock,
  AlertTriangle,
  Webhook,
  Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusOf } from "@/lib/facade";
import { cn, formatCost } from "@/lib/utils";

/** Petits composants partagés : PR, coût, branche, statut, source.
 *  Couleurs sémantiques cohérentes (emerald=ok, red=échec, amber=attente,
 *  blue=en cours, muted=neutre) — alignées sur lib/facade.ts. */

function httpHref(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith("http") ? value : `https://${value}`;
}

/** Extrait `owner/repo` et `#num` d'une URL de PR GitHub. */
export function parsePrUrl(url: string | null | undefined): { repo: string | null; number: number | null } {
  if (!url) return { repo: null, number: null };
  const m = url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
  return m ? { repo: m[1], number: Number(m[2]) } : { repo: null, number: null };
}

export function PrLink({
  url,
  showRepo = false,
  className,
}: {
  url: string | null | undefined;
  showRepo?: boolean;
  className?: string;
}) {
  const href = httpHref(url);
  if (!href) return null;
  const { repo, number } = parsePrUrl(href);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-sm border border-border px-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-brand/40 hover:text-brand",
        className,
      )}
    >
      <GitPullRequest className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span className="tabular-nums">{number != null ? `#${number}` : "PR"}</span>
      {showRepo && repo && <span className="truncate text-muted-foreground">{repo}</span>}
    </a>
  );
}

export function CostBadge({ usd, className }: { usd: number | string | null | undefined; className?: string }) {
  const txt = formatCost(usd);
  if (!txt) return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-sm bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground",
        className,
      )}
    >
      {txt}
    </span>
  );
}

export function BranchChip({ branch, className }: { branch: string | null | undefined; className?: string }) {
  if (!branch) return null;
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-sm bg-muted px-1.5 font-mono text-xs text-muted-foreground",
        className,
      )}
      title={branch}
    >
      <GitBranch className="h-3 w-3 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{branch}</span>
    </span>
  );
}

// Statuts hors-runs (PR/proposition) — mêmes couleurs sémantiques que facade.ts.
const EXTRA_STATUS: Record<string, { label: string; classes: string }> = {
  merged: { label: "mergé", classes: "bg-success-soft text-success" },
  open: { label: "ouvert", classes: "bg-muted text-muted-foreground" },
  closed: { label: "fermé", classes: "bg-muted text-muted-foreground" },
  draft: { label: "draft", classes: "bg-muted text-muted-foreground" },
  pending: { label: "à confirmer", classes: "bg-warn-soft text-warn" },
  approved: { label: "approuvé", classes: "bg-success-soft text-success" },
  dismissed: { label: "rejeté", classes: "bg-muted text-muted-foreground" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const extra = EXTRA_STATUS[status];
  const s = extra ?? statusOf(status);
  const pulse = (s as { pulse?: boolean }).pulse ?? false;
  return (
    <Badge className={cn(s.classes, className)}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {label ?? s.label}
    </Badge>
  );
}

// Source d'une proposition → icône + couleur.
const SOURCE: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  chat: { label: "Chat", icon: MessageSquare, color: "text-foreground" },
  ui: { label: "Chat", icon: MessageSquare, color: "text-foreground" },
  discord: { label: "Discord", icon: MessageSquare, color: "text-[#5865F2]" },
  cron: { label: "Cron", icon: Clock, color: "text-sky-500" },
  sentry: { label: "Sentry", icon: AlertTriangle, color: "text-[#e1567c]" },
  webhook: { label: "Webhook", icon: Webhook, color: "text-violet-400" },
};

export function SourceChip({ source, className }: { source: string; className?: string }) {
  const s = SOURCE[source] ?? { label: source, icon: Hash, color: "text-muted-foreground" };
  const Icon = s.icon;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Icon className={cn("h-3 w-3 shrink-0", s.color)} strokeWidth={1.75} />
      {s.label}
    </span>
  );
}
