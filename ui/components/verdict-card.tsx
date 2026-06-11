"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Markdown } from "@/lib/markdown";
import { parseVerifyReport, verdictLabel, type VerifyInput, type VerifyReport } from "@/lib/verify-report";

type Tone = { dot: string; text: string; ring: string };
const TONE: Record<string, Tone> = {
  PASS: { dot: "bg-emerald-500", text: "text-emerald-500", ring: "border-emerald-500/25" },
  FAIL: { dot: "bg-red-500", text: "text-red-500", ring: "border-red-500/25" },
  // SKIP = caution (amber) : approuver sans vérif est un signal, pas un détail neutre.
  SKIP: { dot: "bg-amber-500", text: "text-amber-500", ring: "border-amber-500/25" },
  none: { dot: "bg-muted-foreground/50", text: "text-muted-foreground", ring: "border-border" },
};

/**
 * Rapport de vérif compact : badge verdict coloré + claim en une ligne + « détails »
 * repliable (étapes ✅/❌, méthode, findings). Mur de texte → JAMAIS dumpé tel quel.
 * Entrée mal formée → repli sur un rendu markdown sûr.
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
      <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Vérification</p>
        <Markdown>{report.raw}</Markdown>
      </div>
    );
  }

  const tone = TONE[report.verdict ?? "none"];

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", tone.ring, className)}>
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        disabled={!hasDetails}
        aria-expanded={hasDetails ? open : undefined}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left",
          hasDetails && "transition-colors hover:bg-accent/40",
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
        <span className={cn("shrink-0 text-xs font-semibold", tone.text)}>{verdictLabel(report.verdict)}</span>
        {report.claim && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{report.claim}</span>
        )}
        {hasDetails && (
          <span className="ml-auto shrink-0 text-muted-foreground">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </button>

      {open && hasDetails && (
        <div className="space-y-2.5 border-t border-border px-3 py-2.5">
          {report.method && (
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Méthode</span>
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] [overflow-wrap:anywhere]">
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
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : s.ok === false ? (
                      <X className="h-3.5 w-3.5 text-red-500" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{s.text}</span>
                </li>
              ))}
            </ul>
          )}
          {report.findings && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 font-mono text-[10px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
              {report.findings}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
