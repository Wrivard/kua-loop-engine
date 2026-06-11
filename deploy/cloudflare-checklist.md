# Checklist Cloudflare — exposer la gateway via Tunnel + Zero Trust Access

> À faire par William (dashboard Cloudflare + 1 commande sudo). L'agent a tout préparé côté
> fichiers. État au moment de l'écriture (2026-06-11) : `cloudflared` **installé**
> (`/usr/local/bin/cloudflared` v2026.6.0) mais **tunnel PAS connecté** (aucun service/process,
> `engine.oryon-temple.ca` ne résout pas encore) ; gateway `localhost:8000` **up**, bridge
> `localhost:8001` **up**. Domaine `oryon-temple.ca` actif sur Cloudflare.

Chaîne cible : **UI Vercel (serveur) → https://engine.oryon-temple.ca → Cloudflare Access →
tunnel cloudflared → gateway localhost:8000.**

## 1. Tunnel `kua-engine`
- Zero Trust → **Networks → Tunnels → Create a tunnel** → connector **cloudflared** → nom `kua-engine`.
- Copie le **token** d'installation, puis sur le VPS (la SEULE commande sudo) :
  ```bash
  sudo cloudflared service install <TOKEN>
  systemctl status cloudflared   # doit être active (running) + tunnel "HEALTHY" dans le dashboard
  ```

## 2. Public Hostname
- Dans le tunnel → onglet **Public Hostname → Add a public hostname** :
  - Subdomain `engine`, Domain `oryon-temple.ca` (→ `engine.oryon-temple.ca`).
  - Service : **HTTP** → `localhost:8000` (la gateway). (Le bridge MCP 8001 = étape ultérieure.)
- Cloudflare crée le CNAME automatiquement → `engine.oryon-temple.ca` résout.

## 3. Application Access (self-hosted) « Kua Engine »
- Zero Trust → **Access → Applications → Add an application → Self-hosted**.
  - Nom `Kua Engine`, domaine `engine.oryon-temple.ca`.
  - **Policy 1 (humains)** : Action **Allow**, Include → **Emails** : `wrivard@kua.quebec` (+ le partenaire).
- Cette app protège TOUT le hostname (y compris `/health`, `/internal/*`).

## 4. Service token (pour l'UI Vercel)
- Zero Trust → **Access → Service Auth → Create Service Token** → nom `kua-vercel`.
  - Note le **Client ID** et le **Client Secret** (le secret n'est montré qu'UNE fois).
- Dans l'app « Kua Engine » → **Add a policy** :
  - **Policy 2 (machine)** : Action **Service Auth**, Include → **Service Token** = `kua-vercel`.
- (Optionnel mais propre) ajoute-les aussi dans `/srv/kua/.env` pour le smoke local :
  ```
  CF_ACCESS_CLIENT_ID=<client id>
  CF_ACCESS_CLIENT_SECRET=<client secret>
  ```

## 5. Variables d'env Vercel (+ redeploy)
Contrat complet dans `ui/BUILD-NOTES.md` § Cloudflare. À renseigner (Project → Settings → Environment Variables) :
- **serveur** : `GATEWAY_INTERNAL_URL=https://engine.oryon-temple.ca`, `INTERNAL_TOKEN=<= /srv/kua/.env>`,
  `CF_ACCESS_CLIENT_ID=<…>`, `CF_ACCESS_CLIENT_SECRET=<…>`, `SYSTEM_ADMIN_EMAILS=wrivard@kua.quebec`.
- **client** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Aucun `GITHUB_TOKEN` dans Vercel.** Puis **Redeploy**.

## 6. Validation
```bash
bash scripts/verify-cloudflare.sh
```
Attendu : (a) `/health` SANS auth → **bloqué** par Access (302/403) ; (b) `/health` AVEC le service
token → **JSON health**. Puis dans l'app : Réglages → Système passe au vert, le chat propose vraiment
(le cerveau devient joignable), et « Créer un repo » fonctionne.

> ⚠️ Après avoir mis le nouveau code (endpoints `/internal/agent/*`), **redémarre la gateway** pour
> qu'elle charge le cerveau : `sudo systemctl restart kua-gateway` (sinon `/internal/agent/propose`
> répond 404, comme constaté pendant la preuve M7).

## 7. Webhook Sentry (M18) — après l'exposition Cloudflare
- URL à mettre dans Sentry (Settings → Alerts/Integrations → Webhooks) :
  `https://engine.oryon-temple.ca/webhooks/sentry`
- Secret PAR SOURCE : ajoute `WEBHOOK_SECRET_SENTRY=<aléatoire long>` dans `/srv/kua/.env`. Le webhook
  exige soit l'en-tête `X-Webhook-Secret: <valeur>`, soit `?token=<valeur>` (si Sentry n'envoie pas
  d'en-tête custom). Secret absent → l'endpoint répond « non configuré » proprement.
- ⚠️ Access protège TOUT le hostname → Sentry (sans login ni service token) serait BLOQUÉ. Deux options :
  - **(DÉFAUT recommandé) Service Auth** : crée un 2e service token Cloudflare pour Sentry et configure
    Sentry pour envoyer `CF-Access-Client-Id`/`CF-Access-Client-Secret`. (Selon que Sentry permet les
    en-têtes custom.)
  - **Bypass de path** : dans l'app Access « Kua Engine », policy **Bypass** sur `/webhooks/*`
    (Include : Everyone). Sûr car le webhook reste protégé par SON propre `WEBHOOK_SECRET_*`. Plus simple
    si Sentry ne peut pas envoyer les en-têtes CF.
  → On part sur **Service Auth** ; bascule sur le **Bypass `/webhooks/*`** si Sentry ne peut pas.
- Reste à faire : mapper projet Sentry → projet kua (pour l'instant la proposition arrive sans projet ;
  tu le choisis dans l'inbox via « Modifier »).
