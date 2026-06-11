import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown-parse";

/**
 * `<Markdown>` — rendu sûr d'un texte riche, utilisé PARTOUT où du markdown
 * peut apparaître (réponses du cerveau, résumés de run, notifications, vérif).
 * Aucun `dangerouslySetInnerHTML` : React échappe tout texte → zéro injection.
 * Voir `lib/markdown-parse.ts` pour le parseur (pur, testé).
 */

function Text({ v }: { v: string }) {
  // Les retours-ligne « doux » d'un paragraphe deviennent de vrais <br/>.
  const parts = v.split("\n");
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {p}
        </Fragment>
      ))}
    </>
  );
}

function renderInline(nodes: Inline[], key: string): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case "text":
        return <Text key={k} v={n.v} />;
      case "strong":
        return (
          <strong key={k} className="font-semibold text-foreground">
            {renderInline(n.c, k)}
          </strong>
        );
      case "em":
        return <em key={k}>{renderInline(n.c, k)}</em>;
      case "code":
        return (
          <code
            key={k}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground [overflow-wrap:anywhere]"
          >
            {n.v}
          </code>
        );
      case "link":
        return (
          <a
            key={k}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="font-medium text-brand underline-offset-2 hover:underline [overflow-wrap:anywhere]"
          >
            {renderInline(n.c, k)}
          </a>
        );
    }
  });
}

function renderBlock(b: Block, key: string): ReactNode {
  switch (b.t) {
    case "h": {
      const inner = renderInline(b.c, key);
      if (b.level === 1)
        return (
          <h3 key={key} className="mt-1 text-[0.95rem] font-semibold tracking-tight first:mt-0">
            {inner}
          </h3>
        );
      if (b.level === 2)
        return (
          <h4 key={key} className="mt-1 text-sm font-semibold tracking-tight first:mt-0">
            {inner}
          </h4>
        );
      return (
        <h5 key={key} className="mt-1 text-sm font-medium text-muted-foreground first:mt-0">
          {inner}
        </h5>
      );
    }
    case "p":
      return <p key={key}>{renderInline(b.c, key)}</p>;
    case "ul":
      return (
        <ul key={key} className="ml-1 space-y-1">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">{renderInline(it, `${key}.${i}`)}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={key} className="ml-1 space-y-1">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1">{renderInline(it, `${key}.${i}`)}</span>
            </li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap"
        >
          <code>{b.v}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-border pl-3 text-muted-foreground"
        >
          {renderInline(b.c, key)}
        </blockquote>
      );
  }
}

export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  const blocks = parseMarkdown(children ?? "");
  if (blocks.length === 0) return null;
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed [overflow-wrap:anywhere]", className)}>
      {blocks.map((b, i) => renderBlock(b, `b${i}`))}
    </div>
  );
}
