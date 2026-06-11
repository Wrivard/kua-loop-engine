/**
 * Parseur Markdown minimal et SÛR (présentation seulement).
 *
 * Produit un arbre de blocs/inline — JAMAIS du HTML. Le rendu (`<Markdown>`)
 * crée des éléments React qui échappent le texte : aucune injection HTML possible
 * (zéro `dangerouslySetInnerHTML`). Les URLs de liens sont assainies (`safeHref`) :
 * seuls http(s), mailto, ancres et chemins relatifs passent — `javascript:` est rejeté.
 *
 * Pur (aucun import) → testable sans DOM ni alias. Sous-ensemble couvert :
 * titres, gras, italique, code inline, blocs de code, listes, citations,
 * liens [texte](url), paragraphes.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };

export type Block =
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "code"; lang: string | null; v: string }
  | { t: "quote"; c: Inline[] };

/** N'autorise que des schémas inoffensifs. Retourne null si l'URL est dangereuse. */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^[/#]/.test(url)) return url; // chemin relatif ou ancre
  // tout le reste (javascript:, data:, vbscript:, schémas inconnus) → rejeté
  return null;
}

const INLINE_PATTERNS: { t: Inline["t"] | "linkraw"; re: RegExp }[] = [
  { t: "code", re: /`([^`\n]+)`/ },
  { t: "linkraw", re: /\[([^\]\n]+)\]\(([^)\s]+)\)/ },
  { t: "strong", re: /\*\*([^\n]+?)\*\*/ },
  { t: "em", re: /\*([^*\n]+?)\*|_([^_\n]+?)_/ },
];

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest.length) {
    let best: { idx: number; t: string; m: RegExpMatchArray } | null = null;
    for (const p of INLINE_PATTERNS) {
      const m = rest.match(p.re);
      if (m && m.index != null && (best === null || m.index < best.idx)) {
        best = { idx: m.index, t: p.t, m };
      }
    }
    if (!best) {
      if (rest) out.push({ t: "text", v: rest });
      break;
    }
    if (best.idx > 0) out.push({ t: "text", v: rest.slice(0, best.idx) });
    const m = best.m;
    if (best.t === "code") {
      out.push({ t: "code", v: m[1] });
    } else if (best.t === "linkraw") {
      const href = safeHref(m[2]);
      if (href) out.push({ t: "link", href, c: parseInline(m[1]) });
      else out.push({ t: "text", v: m[0] }); // href dangereux → texte littéral
    } else if (best.t === "strong") {
      out.push({ t: "strong", c: parseInline(m[1]) });
    } else if (best.t === "em") {
      out.push({ t: "em", c: parseInline(m[1] ?? m[2] ?? "") });
    }
    rest = rest.slice(best.idx + m[0].length);
  }
  return out;
}

const RE_HEADING = /^(#{1,3})\s+(.*)$/;
const RE_QUOTE = /^>\s?/;
const RE_UL = /^\s*[-*]\s+/;
const RE_OL = /^\s*\d+\.\s+/;
const RE_FENCE = /^```/;

function isSpecial(line: string): boolean {
  return (
    RE_FENCE.test(line.trim()) ||
    RE_HEADING.test(line) ||
    RE_QUOTE.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line)
  );
}

export function parseMarkdown(src: string): Block[] {
  const lines = (src ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (RE_FENCE.test(line.trim())) {
      const lang = line.trim().slice(3).trim() || null;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // saute la clôture
      blocks.push({ t: "code", lang, v: buf.join("\n") });
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const h = line.match(RE_HEADING);
    if (h) {
      blocks.push({ t: "h", level: h[1].length as 1 | 2 | 3, c: parseInline(h[2]) });
      i++;
      continue;
    }

    if (RE_QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(lines[i].replace(RE_QUOTE, ""));
        i++;
      }
      blocks.push({ t: "quote", c: parseInline(buf.join(" ")) });
      continue;
    }

    if (RE_UL.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && RE_UL.test(lines[i])) {
        items.push(parseInline(lines[i].replace(RE_UL, "")));
        i++;
      }
      blocks.push({ t: "ul", items });
      continue;
    }

    if (RE_OL.test(line)) {
      const items: Inline[][] = [];
      while (i < lines.length && RE_OL.test(lines[i])) {
        items.push(parseInline(lines[i].replace(RE_OL, "")));
        i++;
      }
      blocks.push({ t: "ol", items });
      continue;
    }

    // paragraphe : lignes consécutives non vides et non spéciales
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isSpecial(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ t: "p", c: parseInline(buf.join("\n")) });
  }
  return blocks;
}

/** Concatène le texte visible d'un arbre inline (utile aux previews/tests). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.t === "text" || n.t === "code") return n.v;
      if (n.t === "strong" || n.t === "em" || n.t === "link") return inlineText(n.c);
      return "";
    })
    .join("");
}

/** Texte brut d'un markdown (1re ligne porteuse ou tout) — pour previews courts. */
export function plainText(src: string): string {
  return parseMarkdown(src)
    .map((b) => {
      if (b.t === "h" || b.t === "p" || b.t === "quote") return inlineText(b.c);
      if (b.t === "ul" || b.t === "ol") return b.items.map(inlineText).join(" · ");
      if (b.t === "code") return b.v;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
