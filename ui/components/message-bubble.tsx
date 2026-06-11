import { Markdown } from "@/lib/markdown";
import { Expandable } from "@/components/expandable";
import { cn, timeAgo } from "@/lib/utils";
import type { MessageWithRun } from "@/lib/types";

/** Rendu d'un message texte (grammaire UX-SPEC §3) :
 *  user = bulle compacte droite (surface secondary) ; agent = PROSE sans bulle
 *  (markdown éditorial) ; system = ligne d'événement ultra-discrète.
 *  `showMeta` : horodatage au GROUPE (dernier message d'une suite), pas par bulle. */
export function MessageBubble({
  message,
  showMeta = true,
}: {
  message: MessageWithRun;
  showMeta?: boolean;
}) {
  const { role, content, author, created_at } = message;
  if (!content) return null;

  if (role === "system") {
    return (
      <div className="flex items-center gap-3 py-0.5 text-faint">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0 text-center text-xs">{content}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  }

  const isUser = role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      {isUser ? (
        <div className="max-w-[78%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg rounded-br-sm bg-secondary px-3.5 py-2 text-base text-secondary-foreground">
          {content}
        </div>
      ) : (
        <div className="w-full max-w-[92%]">
          <Expandable collapsedHeight={220} fadeClass="from-background">
            <Markdown>{content}</Markdown>
          </Expandable>
        </div>
      )}
      {showMeta && (
        <span className="px-1 text-xs text-faint">
          {author ?? (isUser ? "Toi" : "Agent")} · {timeAgo(created_at)}
        </span>
      )}
    </div>
  );
}
