import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import type { MessageWithRun } from "@/lib/types";

/** Rendu d'un message texte (user / agent / system). Les messages-run sont
 *  rendus par <RunCard> ; ici on ne traite que le texte. */
export function MessageBubble({ message }: { message: MessageWithRun }) {
  const { role, content, author, created_at } = message;
  if (!content) return null;

  if (role === "system") {
    return (
      <p className="px-2 py-1 text-center text-xs text-muted-foreground">{content}</p>
    );
  }

  const isUser = role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm leading-relaxed",
          isUser ? "bg-secondary text-secondary-foreground" : "border border-border bg-card",
        )}
      >
        {content}
      </div>
      <span className="px-1 text-[11px] text-muted-foreground">
        {author ?? (isUser ? "Toi" : "Agent")} · {timeAgo(created_at)}
      </span>
    </div>
  );
}
