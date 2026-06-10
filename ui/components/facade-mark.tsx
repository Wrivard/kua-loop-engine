import { cn } from "@/lib/utils";
import { facadeColor, facadeLabel, FACADE_ICONS } from "@/lib/facade";
import type { Facade } from "@/lib/types";

/** Point coloré = identité d'une façade (sidebar, listes). Canal séparé du statut. */
export function FacadeDot({
  facade,
  className,
  pulse = false,
}: {
  facade: string;
  className?: string;
  pulse?: boolean;
}) {
  const color = facadeColor(facade);
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color }}
    >
      {pulse && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      )}
    </span>
  );
}

/** Icône teintée de la façade (carte de run, en-tête de conversation). */
export function FacadeIcon({
  facade,
  className,
}: {
  facade: string;
  className?: string;
}) {
  const Icon = FACADE_ICONS[facade as Facade];
  if (!Icon) return null;
  return (
    <Icon
      className={cn("h-4 w-4 shrink-0", className)}
      style={{ color: facadeColor(facade) }}
      aria-hidden
    />
  );
}

/** Étiquette texte de la façade avec point coloré (en-tête de conversation). */
export function FacadeTag({ facade, className }: { facade: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <FacadeDot facade={facade} />
      {facadeLabel(facade)}
    </span>
  );
}
