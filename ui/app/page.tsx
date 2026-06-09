import { RunsList } from "@/components/runs-list";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-[-1.28px]">Runs</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Toutes les exécutions du moteur, en temps réel. Squelette S5.
        </p>
      </header>
      <RunsList />
    </main>
  );
}
