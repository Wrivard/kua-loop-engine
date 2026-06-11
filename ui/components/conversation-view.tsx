"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MessageBubble } from "@/components/message-bubble";
import { RunCard } from "@/components/run-card";
import { EmptyState, ErrorState } from "@/components/empty-state";
import { FacadeTag } from "@/components/facade-mark";
import { StatusPill } from "@/components/status-pill";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useComposerSink, type ComposerTurn } from "@/components/composer/composer-context";
import { useLiveQuery } from "@/lib/use-live-query";
import { getProjectBySlug, getRunsByThread, getThread, getThreadMessages } from "@/lib/queries";
import { buildThreadView } from "@/lib/thread-view";
import { latestRun } from "@/lib/run-state";
import { facadeColor, THREAD_STATUS_LABEL } from "@/lib/facade";
import type { MessageWithRun, Project, RunRow, ThreadRow } from "@/lib/types";

type ConversationData = {
  thread: ThreadRow | null;
  project: Project | null;
  messages: MessageWithRun[];
  runs: RunRow[];
};

export function ConversationView({ threadId }: { threadId: string }) {
  const { data, loading, error, refetch } = useLiveQuery<ConversationData>(
    async () => {
      const [thread, messages, runs] = await Promise.all([
        getThread(threadId),
        getThreadMessages(threadId),
        getRunsByThread(threadId),
      ]);
      const project = thread?.project_id ? await getProjectBySlug(thread.project_id) : null;
      return { thread, project, messages, runs };
    },
    [
      { table: "messages", filter: `thread_id=eq.${threadId}` },
      { table: "runs", filter: `thread_id=eq.${threadId}` },
      { table: "threads", filter: `id=eq.${threadId}` },
      "approvals",
      "projects",
    ],
    [threadId],
  );

  // Écho optimiste (le dock pousse ici) ; retiré quand l'équivalent persistant revient.
  const [extra, setExtra] = useState<MessageWithRun[]>([]);
  useEffect(() => {
    if (!data) return;
    setExtra((prev) => prev.filter((o) => !data.messages.some((m) => m.role === o.role && m.content === o.content)));
  }, [data]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => [...(data?.messages ?? []), ...extra], [data, extra]);
  const view = useMemo(() => buildThreadView(messages, data?.runs ?? []), [messages, data?.runs]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [view.length]);

  // Le dock (composer omniprésent) pousse les messages de ce thread → écho optimiste.
  const thread0 = data?.thread ?? null;
  useComposerSink(
    useMemo(
      () => ({
        push: (t: ComposerTurn) => {
          if (t.role !== "user") return;
          setExtra((prev) => [
            ...prev,
            {
              id: `local-${prev.length}-${t.text.length}`,
              thread_id: threadId,
              role: "user",
              author: "Toi",
              content: t.text,
              run_id: null,
              created_at: new Date().toISOString(),
              run: null,
            },
          ]);
        },
      }),
      [threadId],
    ),
    thread0 ? { kind: "thread", id: threadId, subject: thread0.subject, facade: thread0.facade } : null,
  );

  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <ErrorState message={error} onRetry={() => void refetch()} />
      </div>
    );
  }

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
  const latest = latestRun(data?.runs ?? []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b border-border bg-background/85 py-4 backdrop-blur"
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
            {latest ? (
              <StatusPill status={latest.status} className="mt-0.5 shrink-0" />
            ) : (
              <Badge className="mt-0.5 shrink-0 bg-muted text-muted-foreground">
                {THREAD_STATUS_LABEL[thread.status]}
              </Badge>
            )}
          </div>
          <FacadeTag facade={thread.facade} className="mt-1.5" />
        </div>
      </header>

      {/* Fil — grammaire : message / événement / carte de run unique */}
      <div className="space-y-4 py-6">
        {view.map((item) =>
          item.kind === "runcard" ? (
            <RunCard key={item.id} runs={item.runs} />
          ) : item.kind === "event" ? (
            <EventLine key={item.id} text={item.text} />
          ) : (
            <MessageBubble key={item.id} message={item.message} />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/** Événement (grammaire type 3) : une ligne fine centrée, jamais une bulle. */
function EventLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5 text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-center text-[11px]">{text}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
