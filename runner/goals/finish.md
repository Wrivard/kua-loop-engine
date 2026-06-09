Finition du site d'un client qui a accepté la démo (façade E, doc 15).

BRIEF (.kua/site-brief.yaml versionné dans le repo, seule entrée valide) :
- forfait_vendu (pages incluses) : {forfait}
- contenus_fournis (logo, photos, textes ?) : {contenus}
- domaine : {domaine} | échéance : {echeance}

PHASE COURANTE : {phase}   # plan | lot | finition

TÂCHE selon la phase :
- plan     : propose la liste des pages restantes → livrable = LE PLAN (pas du code).
- lot      : génère un lot de {pages_per_batch} pages sur le gabarit Küa du vertical.
             Contenus manquants → placeholders marqués TODO-CLIENT, listés dans le résumé.
- finition : SEO on-page de base, sitemap, formulaires branchés, responsive →
             checklist de mise en ligne (DNS et go-live restent humains).

Identité Küa + gabarit du vertical = la base. AUCUN fait inventé : manque d'info →
placeholder + question dans le fil, jamais d'invention. Termine par /verify-app +
screenshots des pages touchées.

{common_rules}
