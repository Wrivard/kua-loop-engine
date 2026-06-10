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
import { getProjectBySlug, getRunsByThread, getThread, getThreadMessages } from "@/lib/queries";
import { facadeColor, THREAD_STATUS_LABEL } from "@/lib/facade";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { MessageWithRun, Project, RunRow, ThreadRow } from "@/lib/types";

/** Si un thread a des runs mais aucun message (tôt dans le cycle de vie),
 *  on synthétise une intro + une carte par run — parité avec seedThreadMessages. */
function synthFromRuns(thread: ThreadRow, runs: RunRow[]): MessageWithRun[] {
  const out: MessageWithRun[] = [];
  if (runs[0]) {
    out.push({
      id: `${thread.id}-intro`,
      thread_id: thread.id,
      role: "agent",
      author: "Agent",
      content: runs[0].goal,
      run_id: null,
      created_at: thread.created_at,
      run: null,
    });
  }
  for (const r of runs) {
    out.push({
      id: `${r.id}-msg`,
      thread_id: thread.id,
      role: "run",
      author: null,
      content: null,
      run_id: r.id,
      created_at: r.created_at,
      run: r,
    });
  }
  return out;
}

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
      // Fallback live : thread avec runs mais sans message → synthèse depuis les runs.
      const finalMessages =
        thread && messages.length === 0 ? synthFromRuns(thread, await getRunsByThread(threadId)) : messages;
      return { thread, project, messages: finalMessages };
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

  // Messages envoyés en optimiste ; on ne retire un optimiste QUE lorsque son
  // équivalent persistant revient (sinon un événement realtime sans rapport
  // ferait clignoter/disparaître la bulle avant son aller-retour DB).
  const [extra, setExtra] = useState<MessageWithRun[]>([]);
  useEffect(() => {
    if (!data) return;
    setExtra((prev) =>
      prev.filter(
        (o) =>
          !data.messages.some(
            (m) => m.role === o.role && m.author === o.author && m.content === o.content,
          ),
      ),
    );
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
