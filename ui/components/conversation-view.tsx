"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MessageBubble } from "@/components/message-bubble";
import { RunCard } from "@/components/run-card";
import { Composer } from "@/components/composer";
import { EmptyState } from "@/components/empty-state";
import { FacadeTag } from "@/components/facade-mark";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveQuery } from "@/lib/use-live-query";
import { getProjectBySlug, getThread, getThreadMessages } from "@/lib/queries";
import { facadeColor, THREAD_STATUS_LABEL } from "@/lib/facade";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { MessageWithRun, Project, ThreadRow } from "@/lib/types";

type ConversationData = {
  thread: ThreadRow | null;
  project: Project | null;
  messages: MessageWithRun[];
};

export function ConversationView({ threadId }: { threadId: string }) {
  const { data, loading } = useLiveQuery<ConversationData>(
    async () => {
      const [thread, messages] = await Promise.all([
        getThread(threadId),
        getThreadMessages(threadId),
      ]);
      const project = thread?.project_id ? await getProjectBySlug(thread.project_id) : null;
      return { thread, project, messages };
    },
    ["messages", "runs", "threads", "approvals"],
    [threadId],
  );

  // Messages envoyés en optimiste ; réconciliés dès que la requête se rafraîchit.
  const [extra, setExtra] = useState<MessageWithRun[]>([]);
  useEffect(() => {
    setExtra([]);
  }, [data]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => [...(data?.messages ?? []), ...extra], [data, extra]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (loading && !data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Skeleton className="h-6 w-64" />
        <div className="mt-8 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-3/4" />
        </div>
      </div>
    );
  }

  const thread = data?.thread ?? null;
  if (!thread) {
    return (
      <EmptyState
        title="Conversation introuvable"
        description="Cette conversation n'existe pas ou a été archivée."
      />
    );
  }

  const project = data?.project ?? null;
  const latestRun = [...messages].reverse().find((m) => m.run)?.run ?? null;

  function onSend(content: string, author: string) {
    setExtra((prev) => [
      ...prev,
      {
        id: `local-${prev.length}-${content.length}`,
        thread_id: threadId,
        role: "user",
        author,
        content,
        run_id: null,
        created_at: new Date().toISOString(),
        run: null,
      },
    ]);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 sm:px-6">
      {/* Header */}
      <header
        className="border-b border-border py-4"
        style={{ boxShadow: `inset 3px 0 0 0 ${facadeColor(thread.facade)}` }}
      >
        <div className="pl-3">
          {project && (
            <Link
              href={`/p/${project.id}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {project.name}
            </Link>
          )}
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1 className="text-base font-semibold tracking-tight">{thread.subject}</h1>
            {latestRun ? (
              <StatusPill status={latestRun.status} className="mt-0.5 shrink-0" />
            ) : (
              <Badge className="mt-0.5 shrink-0 bg-muted text-muted-foreground">
                {THREAD_STATUS_LABEL[thread.status]}
              </Badge>
            )}
          </div>
          <FacadeTag facade={thread.facade} className="mt-1.5" />
        </div>
      </header>

      {/* Fil */}
      <div className="flex-1 space-y-4 py-6">
        {messages.map((m) =>
          m.role === "run" && m.run ? (
            <RunCard key={m.id} run={m.run} />
          ) : (
            <MessageBubble key={m.id} message={m} />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 border-t border-border bg-background/80 py-3 backdrop-blur">
        <Composer threadId={threadId} onSend={onSend} />
        {!isSupabaseConfigured && (
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            Mode preview — l&apos;agent ne répond pas (pas de backend).
          </p>
        )}
      </div>
    </div>
  );
}
