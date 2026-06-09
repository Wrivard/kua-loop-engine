Une erreur de production a été capturée par Sentry sur ce projet.

ISSUE : {title}
LIEN  : {permalink}
NIVEAU: {level} | RELEASE: {release} | CULPRIT: {culprit}
DÉTAILS (stack trace / breadcrumbs extraits du payload) :
{details}

TÂCHE :
1. Si le MCP Sentry est configuré, récupère le contexte complet de l'issue {issue_id}
   (stack trace complète, breadcrumbs, suspect commits, analyse Seer si dispo).
2. Identifie la cause racine. Explique-la en 2 phrases dans ton résumé final.
3. Fais le PLUS PETIT fix sûr dans ce repo.
4. Ajoute un test de régression qui échoue sans le fix et passe avec.
5. Roule la suite de tests, puis /verify-app. Corrige jusqu'à vert.

Si le fix exige une décision produit (comportement ambigu) : ARRÊTE-toi et résume —
pas de fix spéculatif large.

{common_rules}
