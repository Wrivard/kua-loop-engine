import * as React from "react";
import { cn } from "@/lib/utils";

/** Pill neutre. Le statut sémantique des runs utilise ses propres classes
 *  de couleur (lib/facade.ts), ce composant fournit la forme de base. */
const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      // transition-colors : la mutation d'état (carte de run) glisse au lieu de sauter.
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-150",
      className,
    )}
    {...props}
  />
));
Badge.displayName = "Badge";

export { Badge };
