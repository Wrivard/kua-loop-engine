"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useLiveQuery } from "@/lib/use-live-query";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/queries";
import { timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

const EMOJI: Record<string, string> = {
  proposal: "💡",
  awaiting: "⏳",
  failed: "❌",
  merged: "✅",
  budget: "💸",
};

export function NotificationBell() {
  const router = useRouter();
  const { data } = useLiveQuery<Notification[]>(getNotifications, ["notifications"], []);
  const notifs = data ?? [];
  const unread = notifs.filter((n) => !n.read).length;

  async function open(n: Notification) {
    if (!n.read) void markNotificationRead(n.id).catch(() => {});
    if (n.link) router.push(n.link);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void markAllNotificationsRead()}>
              Tout lu
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">Aucune notification.</p>
          ) : (
            notifs.map((n) => (
              <button
                key={n.id}
                onClick={() => void open(n)}
                className={cn(
                  "flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-xs transition-colors hover:bg-accent/50",
                  !n.read && "bg-brand/5",
                )}
              >
                <span className="shrink-0">{EMOJI[n.kind] ?? "🔔"}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate", !n.read && "font-medium")}>{n.title}</span>
                  {n.body && <span className="block truncate text-muted-foreground">{n.body}</span>}
                  <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
