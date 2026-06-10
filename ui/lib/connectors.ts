// Miroir TS du registre kua_core/connectors.py (SOURCE DE VÉRITÉ = kua_core).
// Affichage seulement (catalogue, champs). À remplacer par un fetch d'API quand
// la gateway l'expose — voir BUILD-NOTES. Les valeurs SECRÈTES ne transitent
// jamais par l'UI : seuls les noms/labels des champs sont déclarés ici.

export type ConnectorKind = "api" | "mcp";

export interface ConnectorField {
  name: string;
  label: string;
  secret: boolean;
}

export interface ConnectorTypeMeta {
  type: string;
  label: string;
  kind: ConnectorKind;
  shareable: boolean; // true = 1 cred multi-projets ; false = per_project
  fields: ConnectorField[];
}

export const CONNECTOR_TYPES: ConnectorTypeMeta[] = [
  {
    type: "github",
    label: "GitHub",
    kind: "api",
    shareable: true,
    fields: [{ name: "token", label: "Personal Access Token", secret: true }],
  },
  {
    type: "sentry",
    label: "Sentry",
    kind: "api",
    shareable: false,
    fields: [
      { name: "auth_token", label: "Auth token", secret: true },
      { name: "org", label: "Organisation", secret: false },
      { name: "project_slug", label: "Projet", secret: false },
    ],
  },
  {
    type: "cloudflare",
    label: "Cloudflare",
    kind: "api",
    shareable: false,
    fields: [
      { name: "api_token", label: "API token", secret: true },
      { name: "account_id", label: "Account ID", secret: false },
    ],
  },
  {
    type: "discord",
    label: "Discord",
    kind: "api",
    shareable: false,
    fields: [
      { name: "bot_token", label: "Bot token", secret: true },
      { name: "channel_id", label: "Channel ID", secret: false },
    ],
  },
  {
    type: "supabase",
    label: "Supabase",
    kind: "api",
    shareable: false,
    fields: [
      { name: "service_role_key", label: "service_role key", secret: true },
      { name: "url", label: "Project URL", secret: false },
      { name: "db_url", label: "Connection string", secret: true },
    ],
  },
  {
    type: "mcp",
    label: "MCP générique",
    kind: "mcp",
    shareable: false,
    fields: [
      { name: "url", label: "URL du serveur MCP", secret: false },
      { name: "token", label: "Token (optionnel)", secret: true },
    ],
  },
];

export function connectorType(type: string): ConnectorTypeMeta | undefined {
  return CONNECTOR_TYPES.find((t) => t.type === type);
}

// Catalogue de skills (starter set ; toggles globaux dans app_settings.skills).
export interface SkillMeta {
  key: string;
  label: string;
  description: string;
}

export const SKILLS: SkillMeta[] = [
  { key: "frontend-design", label: "Frontend Design", description: "UI distinctive et soignée (composants/pages)." },
  { key: "supabase-postgres", label: "Supabase / Postgres", description: "Bonnes pratiques schéma, RLS, perfs." },
  { key: "code-review", label: "Code Review", description: "Revue multi-dimensions avant livraison." },
  { key: "seo-audit", label: "SEO Audit", description: "Audit + quick-wins (façade premium)." },
];

// Modèles disponibles (alias Claude). Le Runner passe --model {value}.
export const MODEL_OPTIONS = ["sonnet", "opus", "haiku"];

// Libellé lisible d'un statut de connexion.
export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  untested: "non testé",
  ok: "ok",
  error: "erreur",
};
