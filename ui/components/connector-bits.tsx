import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Statut connecteur = canal SÉMANTIQUE (à point) : connecté=vert / erreur=rouge / non testé=neutre.
const STATUS: Record<string, { dot: string; label: string }> = {
  ok: { dot: "bg-success", label: "connecté" },
  error: { dot: "bg-danger", label: "erreur" },
  untested: { dot: "bg-muted-foreground/40", label: "non testé" },
};

export function ConnStatus({ status }: { status?: string | null }) {
  const s = STATUS[status ?? "untested"] ?? STATUS.untested;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

// Portée = miroir global/projet, 2 teintes distinctes (hors couleurs de façade/statut).
export function ScopeBadge({ shareable }: { shareable: boolean }) {
  return shareable ? (
    <Badge className="bg-info-soft text-info">partageable</Badge>
  ) : (
    <Badge className="bg-rose-500/10 text-rose-500">par projet</Badge>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  return <Badge className="bg-muted text-muted-foreground">{kind}</Badge>;
}

// Petite icône de marque, discrète, par connecteur.
export function ConnectorIcon({ className }: { className?: string }) {
  return <Plug className={cn("h-4 w-4 shrink-0 text-brand", className)} aria-hidden />;
}
