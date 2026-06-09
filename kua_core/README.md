# kua_core — paquet partagé

Foyer commun du gateway, du runner et de l'agent de façade (doc 02). Contient :

- `config.py` — chargement des secrets depuis `/srv/kua/.env` (prod) ou `.env` repo (dev).
- `models.py` — dataclasses miroir des 7 tables (doc 03) + énumérations verrouillées.
- `db.py` — **squelette** de la couche d'accès DB (psycopg, SQL standard).

## Note de migration

Le gateway (spike S4) embarque encore son propre adaptateur supabase-py
(`gateway/app/db.py`), marqué temporaire. La réécriture vers `kua_core.db`
(psycopg, transactions réelles) se fait pendant la Phase 0/1 — les signatures
publiques sont déjà alignées pour un swap indolore. **Ne pas refactorer le
gateway tant que son spike doit rester vert.**
