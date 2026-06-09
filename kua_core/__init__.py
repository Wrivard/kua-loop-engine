"""kua_core — paquet partagé par le gateway, le runner et l'agent de façade.

Contient les modèles DB, l'accès Supabase/Postgres et les helpers communs
(doc 02 ARCHITECTURE, doc 03 DATA-MODEL). Tout l'état vit en DB + git, jamais
dans la mémoire de session d'un composant.
"""

__version__ = "0.1.0"
