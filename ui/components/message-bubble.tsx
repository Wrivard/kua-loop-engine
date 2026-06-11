import { Markdown } from "@/lib/markdown";
import { Expandable } from "@/components/expandable";
import { cn, timeAgo } from "@/lib/utils";
import type { MessageWithRun } from "@/lib/types";

/** Rendu d'un message texte (user / agent / system). Les messages-run sont
 *  rendus par <RunCard>. Hiérarchie : user = bulle ; agent = markdown rendu ;
 *  system = ligne d'événement fine (pas une bulle). */
export function MessageBubble({ message }: { message: MessageWithRun }) {
  const { role, content, author, created_at } = message;
  if (!content) return null;

  // Événement / système : ligne fine centrée, encadrée de filets — pas une bulle.
  if (role === "system") {
    return (
      <div className="flex items-center gap-3 py-0.5 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-center text-[11px]">{content}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  const isUser = role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {isUser ? (
        <div className="max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl bg-secondary px-3.5 py-2 text-sm leading-relaxed text-secondary-foreground">
          {content}
        </div>
      ) : (
        <div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-border bg-card px-3.5 py-2.5">
          <Expandable collapsedHeight={200} fadeClass="from-card">
            <Markdown>{content}</Markdown>
          </Expandable>
        </div>
      )}
      <span className="px-1 text-[11px] text-muted-foreground">
        {author ?? (isUser ? "Toi" : "Agent")} · {timeAgo(created_at)}
      </span>
    </div>
  );
}
