// Sonde S5 : prouve que Supabase Realtime livre les INSERT de `runs`
// au client anon (le mécanisme exact que l'UI consomme).
// Usage : node scripts/realtime-probe.mjs  (exit 0 = événement reçu, 1 = timeout)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const startedAt = Date.now();
const timeout = setTimeout(() => {
  console.log(JSON.stringify({ probe: "realtime", result: "TIMEOUT after 60s" }));
  process.exit(1);
}, 60_000);

supabase
  .channel("probe-runs")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "runs" }, (payload) => {
    clearTimeout(timeout);
    console.log(
      JSON.stringify({
        probe: "realtime",
        result: "OK",
        latency_note: `received ${Date.now() - startedAt}ms after probe start`,
        run_id: payload.new.id,
        status: payload.new.status,
        goal: payload.new.goal,
      }),
    );
    process.exit(0);
  })
  .subscribe((status) => {
    console.log(JSON.stringify({ probe: "realtime", channel_status: status }));
  });
