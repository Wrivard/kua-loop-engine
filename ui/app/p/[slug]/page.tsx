import { AppShell } from "@/components/app-shell";
import { ProjectView } from "@/components/project-view";

export default function ProjectPage({ params }: { params: { slug: string } }) {
  return (
    <AppShell>
      <ProjectView slug={params.slug} />
    </AppShell>
  );
}
