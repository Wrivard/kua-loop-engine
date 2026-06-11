"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, Menu, LogOut, MessageSquare, Plus, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FacadeDot } from "@/components/facade-mark";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { useLiveQuery } from "@/lib/use-live-query";
import { getSidebarProjects } from "@/lib/queries";
import { useCurrentUser, signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { SidebarProject } from "@/lib/types";

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[11px] font-medium tabular-nums text-background">
      {n}
    </span>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: projects } = useLiveQuery<SidebarProject[]>(
    getSidebarProjects,
    ["threads", "loops", "projects"],
    [],
  );
  const { user } = useCurrentUser();

  const list = projects ?? [];
  const totalAwaiting = list.reduce((sum, p) => sum + p.awaiting, 0);
  const isHome = pathname === "/";
  const isInbox = pathname === "/inbox";

  async function handleSignOut() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Wordmark */}
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2 px-4 py-4 text-sm font-medium tracking-tight"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-brand" />
        Küa · Loops
      </Link>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <Link
          href="/"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isHome ? "bg-brand/10 font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Accueil
        </Link>
        <Link
          href="/inbox"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isInbox ? "bg-brand/10 font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Inbox className="h-4 w-4" />
          Inbox
          <CountBadge n={totalAwaiting} />
        </Link>

        <div className="flex items-center justify-between px-2.5 pb-1 pt-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Projets
          </p>
          <NewProjectDialog
            onCreated={onNavigate}
            trigger={
              <button
                aria-label="Nouveau projet"
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          />
        </div>
        <div className="space-y-0.5">
          {list.map((p) => {
            const active = pathname === `/p/${p.id}` || pathname.startsWith(`/p/${p.id}/`);
            return (
              <Link
                key={p.id}
                href={`/p/${p.id}`}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-brand/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span className="flex w-8 shrink-0 items-center gap-0.5">
                  {p.facades.length ? (
                    p.facades.map((f) => <FacadeDot key={f} facade={f} />)
                  ) : (
                    <span className="h-2 w-2" />
                  )}
                </span>
                <span className="truncate">{p.name}</span>
                <CountBadge n={p.awaiting} />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Réglages */}
      <div className="border-t border-border p-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            pathname === "/settings"
              ? "bg-brand/10 font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Settings className="h-4 w-4" />
          Réglages
        </Link>
      </div>

      {/* Footer utilisateur */}
      <div className="border-t border-border px-3 py-3">
        {user?.configured ? (
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            <button
              onClick={handleSignOut}
              aria-label="Se déconnecter"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Mode preview · données de démo</span>
        )}
      </div>
    </div>
  );
}

/** Coquille de l'app : sidebar persistante (desktop) + drawer (mobile). */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border md:flex">
        <SidebarNav />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre supérieure mobile */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/80 px-3 py-3 backdrop-blur md:hidden">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger
              aria-label="Menu"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </DialogTrigger>
            <DialogContent side="left" className="p-0">
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              <DialogDescription className="sr-only">
                Navigation entre l&apos;inbox et les projets
              </DialogDescription>
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </DialogContent>
          </Dialog>
          <span className="flex items-center gap-2 text-sm font-medium tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-brand" />
            Küa · Loops
          </span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
