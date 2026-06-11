"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BrainChat } from "@/components/brain-chat";

// Enveloppe le chat-cerveau dans un dialog (création de loop/thread « par conversation »).
export function BrainChatDialog({
  trigger,
  title = "Assistant Küa",
  description,
  source = "ui",
  projectId,
  greeting,
  placeholder,
}: {
  trigger: ReactNode;
  title?: string;
  description?: string;
  source?: string;
  projectId?: string;
  greeting?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent side="center" className="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex min-h-[55vh] flex-1 flex-col px-4 pb-4">
          <BrainChat
            source={source}
            projectId={projectId}
            greeting={greeting}
            placeholder={placeholder}
            onCreated={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
