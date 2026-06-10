import { Badge } from "@/components/ui/badge";
import { statusOf } from "@/lib/facade";
import { cn } from "@/lib/utils";

/** Pill sémantique du statut d'un run (doc 12 : jamais la couleur de façade).
 *  Les statuts « actifs » pulsent doucement (running, preparing, verifying). */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  const s = statusOf(status);
  return (
    <Badge className={cn(s.classes, className)}>
      {s.pulse && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {s.label}
    </Badge>
  );
}
