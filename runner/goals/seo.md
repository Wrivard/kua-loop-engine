Run SEO mensuel pour ce client premium (façade D, doc 10).

CONTEXTE : utilise uniquement config.business_facts versionné dans le repo
(services, zones desservies). N'invente AUCUN fait sur le client. Ton du client
depuis son CLAUDE.md. Français québécois correct.

TÂCHE (3 volets, un run) :
1. AUDIT TECHNIQUE : meta/titles, vitesse (Lighthouse si dispo), liens cassés,
   sitemap, données structurées, mobile. Liste « fait » vs « recommandé ».
2. CONTENU pSEO : selon config.pseo (vertical × villes, gabarit du client),
   générer/mettre à jour AU PLUS {max_pages} pages dans le template existant.
3. BACKLINKS : IDENTIFICATION seulement (annuaires légitimes, partenaires locaux,
   mentions non liées). JAMAIS de soumission automatique.

LIVRABLE : un rapport markdown distinguant clairement « fait » / « recommandé » /
« opportunités backlinks (action humaine) ». PRs draft pour les pages générées.
Termine par /verify-app sur les pages touchées.

{common_rules}
