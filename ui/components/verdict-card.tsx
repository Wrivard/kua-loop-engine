"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, ShieldAlert, ShieldCheck, ShieldX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { parseVerifyReport, verdictLabel, type VerifyInput, type VerifyReport } from "@/lib/verify-report";

type Tone = { icon: typeof ShieldCheck; text: string; ring: string };
const TONE: Record<string, Tone> = {
  PASS: { icon: ShieldCheck, text: "text-success", ring: "border-success/20" },
  FAIL: { icon: ShieldX, text: "text-danger", ring: "border-danger/25" },
  // SKIP = caution : approuver sans vérif est un signal, pas un détail neutre.
  SKIP: { icon: ShieldAlert, text: "text-warn", ring: "border-warn/25" },
  none: { icon: ShieldAlert, text: "text-muted-foreground", ring: "border-border" },
};

/**
 * Verdict de vérif EN UNE LIGNE (DESIGN-SYSTEM §6) : icône fine + verdict + claim,
 * détails (méthode, étapes, findings) derrière un repli unique. Jamais un mur de texte.
 * Entrée mal formée → repli markdown sûr.
 */
export function VerdictCard({
  input,
  report: reportProp,
  defaultOpen = false,
  className,
}: {
  input?: VerifyInput;
  report?: VerifyReport;
  defaultOpen?: boolean;
  className?: string;
}) {
  const report = reportProp ?? parseVerifyReport(input);
  const hasDetails = !!report.method || report.steps.length > 0 || !!report.findings;
  const [open, setOpen] = useState(defaultOpen);

  const isFallback = !report.verdict && !report.claim && report.steps.length === 0;
  if (isFallback) {
    if (!report.raw.trim()) return null;
    return (
      <div className={cn("rounded-md border border-border bg-muted/40 p-3", className)}>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-faint">Vérification</p>
        <Markdown>{report.raw}</Markdown>
      </div>
    );
  }

  const tone = TONE[report.verdict ?? "none"];
  const Icon = tone.icon;

  return (
    <div className={cn("overflow-hidden rounded-md border bg-transparent", tone.ring, className)}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? open : undefined}
        className={cn(
          "flex h-9 w-full items-center gap-2 px-3 text-left",
          hasDetails && "transition-colors duration-150 hover:bg-accent",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", tone.text)} strokeWidth={1.75} aria-hidden />
        <span className={cn("shrink-0 text-sm font-medium", tone.text)}>{verdictLabel(report.verdict)}</span>
        {report.claim && <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{report.claim}</span>}
        {hasDetails && (
          <span className="ml-auto shrink-0 text-faint">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {open && hasDetails && (
        <div className="space-y-2.5 border-t border-border px-3 py-2.5 animate-fade-in">
          {report.method && (
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Méthode</span>
              <code className="rounded-sm bg-muted px-1 py-px font-mono [overflow-wrap:anywhere]">
                {report.method}
              </code>
            </div>
          )}
          {report.steps.length > 0 && (
            <ul className="space-y-1">
              {report.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="mt-0.5 shrink-0">
                    {s.ok === true ? (
                      <Check className="h-3.5 w-3.5 text-success" strokeWidth={2} />
                    ) : s.ok === false ? (
                      <X className="h-3.5 w-3.5 text-danger" strokeWidth={2} />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-faint" strokeWidth={2} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{s.text}</span>
                </li>
              ))}
            </ul>
          )}
          {report.findings && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-muted p-2 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {report.findings}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
