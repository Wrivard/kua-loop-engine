import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests de logique PURE (présentation) — environnement node, pas de DOM.
// Alias @ → racine ui/ pour que les modules résolvent leurs imports internes.
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
});
