import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Premier jour du mois courant (heure locale). Base du « coût du mois »
 *  — partagé par getMonthCost (live) et seedMonthCost pour rester en phase. */
export function monthStartDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Coût formaté en dollars (sortie claude -p : total_cost_usd). */
export function formatCost(cost: number | string | null | undefined): string | null {
  if (cost == null) return null;
  const n = typeof cost === "string" ? Number(cost) : cost;
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toFixed(2)} $`;
}

/** « il y a 3 min », « hier », date sinon (fr-CA). */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-CA");
}
