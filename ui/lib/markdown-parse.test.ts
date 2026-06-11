import { describe, it, expect } from "vitest";
import {
  safeHref,
  parseInline,
  parseMarkdown,
  inlineText,
  plainText,
  type Inline,
} from "@/lib/markdown-parse";

function types(nodes: Inline[]): string[] {
  return nodes.map((n) => n.t);
}
function hasType(nodes: Inline[], t: string): boolean {
  return nodes.some((n) => n.t === t || ((n.t === "strong" || n.t === "em" || n.t === "link") && hasType(n.c, t)));
}

describe("safeHref", () => {
  it("accepte http(s), mailto, ancres et chemins relatifs", () => {
    expect(safeHref("https://kua.quebec")).toBe("https://kua.quebec");
    expect(safeHref("http://x.io/a")).toBe("http://x.io/a");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeHref("/p/slug")).toBe("/p/slug");
    expect(safeHref("#section")).toBe("#section");
  });
  it("rejette javascript:, data:, vbscript: et schémas inconnus", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>")).toBeNull();
    expect(safeHref("vbscript:msgbox")).toBeNull();
    expect(safeHref("  ")).toBeNull();
  });
});

describe("parseInline", () => {
  it("gras, italique, code, lien", () => {
    expect(types(parseInline("**gras**"))).toEqual(["strong"]);
    expect(types(parseInline("_ital_"))).toEqual(["em"]);
    expect(types(parseInline("`code`"))).toEqual(["code"]);
    const link = parseInline("[Küa](https://kua.quebec)");
    expect(link).toHaveLength(1);
    expect(link[0]).toMatchObject({ t: "link", href: "https://kua.quebec" });
    expect(inlineText(link)).toBe("Küa");
  });

  it("un lien avec href dangereux devient du texte littéral (jamais un lien)", () => {
    const nodes = parseInline("[clique](javascript:alert(1))");
    expect(hasType(nodes, "link")).toBe(false);
    expect(inlineText(nodes)).toContain("javascript");
  });
});

describe("parseMarkdown — structure", () => {
  it("titres, listes, citation, bloc de code", () => {
    const md = "## Titre\n\n- a\n- b\n\n> note\n\n```\nx=1\n```";
    const blocks = parseMarkdown(md);
    const kinds = blocks.map((b) => b.t);
    expect(kinds).toContain("h");
    expect(kinds).toContain("ul");
    expect(kinds).toContain("quote");
    expect(kinds).toContain("code");
    const h = blocks.find((b) => b.t === "h");
    expect(h && h.t === "h" && h.level).toBe(2);
    const ul = blocks.find((b) => b.t === "ul");
    expect(ul && ul.t === "ul" && ul.items.length).toBe(2);
  });
});

describe("aucune injection HTML", () => {
  it("le HTML est traité comme du texte, jamais comme un élément", () => {
    const blocks = parseMarkdown("<script>alert('xss')</script>");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].t).toBe("p");
    if (blocks[0].t === "p") {
      // Uniquement du texte — aucun lien/structure dérivé du HTML.
      expect(hasType(blocks[0].c, "link")).toBe(false);
      expect(inlineText(blocks[0].c)).toBe("<script>alert('xss')</script>");
    }
  });

  it("plainText nettoie le markdown pour un aperçu", () => {
    expect(plainText("## Bug\n\nLe **formulaire** plante sur `mobile`.")).toBe(
      "Bug Le formulaire plante sur mobile.",
    );
  });

  it("entrées vides → pas de bloc", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});
