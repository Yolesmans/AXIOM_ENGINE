# Décision stabilité infra — AXIOM (single-instance)

**Date :** 2025-02-10  
**Statut :** Décision actée. À valider côté Railway + logs.

---

## Décision

Nous arrêtons immédiatement toute logique multi-instance.

**Configuration Railway cible :**
- **Replicas = 1** (fixe)
- **Autoscaling = OFF**

**Objectif :** Garantir une seule instance serveur pour éliminer toute désynchronisation liée au mutex bloc 2 in-memory, au cache mémoire getAsync et aux lectures Redis concurrentes.

Tant qu’un lock distribué Redis n’est pas implémenté, AXIOM doit tourner en **single-instance strict**.

**Périmètre :** On ne touche plus à l’UX ni aux miroirs tant que la stabilité infra n’est pas validée.

---

## Confirmation à faire (côté équipe / ops)

### 1) Railway : 1 replica fixe

- [ ] Ouvrir le projet AXIOM sur [Railway](https://railway.app) (ou l’URL du dashboard utilisé).
- [ ] Aller dans **Settings** (ou **Deployments** / **Service** selon l’UI) du service qui exécute AXIOM.
- [ ] Section **Scaling** ou **Replicas** : vérifier que le nombre de replicas est réglé à **1**.
- [ ] S’il existe un champ « Min replicas » / « Max replicas », les mettre à **1** / **1**.
- [ ] Sauvegarder si nécessaire.

**Confirmation :** « Railway est configuré en 1 replica fixe » — OUI / NON — Date : ___________

---

### 2) Railway : Autoscaling désactivé

- [ ] Dans la même section **Scaling** (ou **Auto-scaling**), vérifier qu’**aucune** option d’autoscaling n’est activée (pas de scale-up par CPU, par requêtes, etc.).
- [ ] Si une option existe (ex. « Enable auto-scaling »), la désactiver.

**Confirmation :** « L’autoscaling est désactivé » — OUI / NON — Date : ___________

---

### 3) Logs : un seul instanceId

- [ ] Après déploiement avec 1 replica, déclencher plusieurs requêtes (parcours court : /start + 2–3 POST /axiom/stream).
- [ ] Consulter les logs du service (Railway Logs ou export).
- [ ] Rechercher les lignes `[AXIOM_REQ]` (ou équivalent) et noter la valeur de **instanceId** (RAILWAY_REPLICA_ID, INSTANCE_ID ou process.pid).
- [ ] Vérifier que **toutes** les requêtes ont le **même** instanceId.

**Confirmation :** « Les logs montrent un seul instanceId pour toutes les requêtes » — OUI / NON — Date : ___________

---

## Référence code (sans modification)

- **Mutex bloc 2 :** `src/server.ts` L48–60 — in-memory, protège uniquement l’instance courante.
- **getAsync :** `src/store/sessionStore.ts` L192–212 — priorité cache mémoire puis Redis.
- **Log instanceId :** `src/server.ts` L69–82 — `logRequestState` logue `instanceId` (RAILWAY_REPLICA_ID ?? INSTANCE_ID ?? process.pid).

Aucun changement de code requis pour respecter cette décision ; seule la configuration Railway et la vérification des logs sont nécessaires.
