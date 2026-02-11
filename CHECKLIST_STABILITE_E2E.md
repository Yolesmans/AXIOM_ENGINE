# Checklist stabilité E2E — AXIOM/REVELIOM

**Usage :** checklist **manuelle** (pas d’automation E2E). À exécuter après chaque vague de correctifs de stabilité pour valider l’absence de régression et le comportement identique multi-device / multi-route.

**Résultat attendu global :** même séquence de questions et mêmes transitions sur tous les devices ; zéro retour en arrière ; zéro blocage ; aucun doublon de question.

---

## 1. Parcours complet bloc 1 → 10

Cocher pour chaque device / condition une fois le parcours terminé sans anomalie.

### 1.1 iPhone Safari (4G ou réseau à latence)

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 1.1.1 | Ouvrir l’URL (tenant + poste). Page charge, pas d’erreur. | | |
| 1.1.2 | Renseigner identité (prénom, nom, email). Envoyer. | | |
| 1.1.3 | Préambule affiché. Cliquer « Je commence mon profil ». | | |
| 1.1.4 | Bloc 1 : répondre à la question. Une seule question affichée à la fois. | | |
| 1.1.5 | Miroir bloc 1 affiché. Envoyer un message (ex. « ok »). | | |
| 1.1.6 | Bloc 2A : 3 questions (medium, préférence, œuvre). Répondre dans l’ordre. | | |
| 1.1.7 | Bloc 2B : questions motif + personnages (6). Puis traits + récap si générés. Répondre à chaque question une fois. | | |
| 1.1.8 | Miroir 2B affiché. Envoyer un message (ex. « ok »). | | |
| 1.1.9 | Bloc 3 : première question affichée. Enchaîner questions jusqu’au miroir 3. | | |
| 1.1.10 | Après miroir 3, envoyer un message. Bloc 4 démarre. Même logique pour blocs 4 → 9. | | |
| 1.1.11 | Bloc 10 : questions puis synthèse. Synthèse affichée une seule fois. | | |
| 1.1.12 | Bouton « Je génère mon matching » (ou équivalent) affiché. Cliquer. | | |
| 1.1.13 | État terminal (DONE_MATCHING ou équivalent). Pas de boucle, pas de retour en arrière. | | |

**Résumé :** Parcours 1→10 sans retour en arrière ni blocage ? **OUI / NON**

---

### 1.2 Desktop Chrome

Reproduire les mêmes étapes 1.1.1 à 1.1.13 sur Desktop Chrome.

| Étape | OK / KO | Note |
|-------|---------|------|
| 1.2.1 à 1.2.13 | (même numérotation que 1.1.x) | |

**Résumé :** Parcours 1→10 identique (même ordre de questions / transitions) ? **OUI / NON**

---

### 1.3 iPad (si possible)

Reproduire les mêmes étapes sur iPad (Safari ou Chrome).

| Étape | OK / KO | Note |
|-------|---------|------|
| 1.3.1 à 1.3.13 | (même numérotation) | |

**Résumé :** Parcours 1→10 sans anomalie ? **OUI / NON**

---

## 2. Scénarios de stress / régression

À faire sur au moins un device (idéalement iPhone Safari 4G ou Desktop avec throttle).

### 2.1 Refresh à mi-bloc

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 2.1.1 | Arriver au milieu du bloc 2B (ex. après 3 réponses). | | |
| 2.1.2 | Rafraîchir la page (F5 ou pull-to-refresh). | | |
| 2.1.3 | Rouvrir l’URL (même session si conservée, ou /start). | | |
| 2.1.4 | Vérifier : la **prochaine** question affichée est bien celle attendue (pas de reprise depuis la question 1 du bloc 2B). | | |
| 2.1.5 | Terminer le bloc 2B et la transition 2→3. Aucun retour en arrière. | | |

**Résumé :** Refresh à mi-bloc ne casse pas la séquence ? **OUI / NON**

---

### 2.2 Double tap / double envoi

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 2.2.1 | Être sur une question (bloc 2B ou 3). | | |
| 2.2.2 | Taper une réponse et envoyer. Immédiatement taper une deuxième fois sur Envoyer (ou double tap). | | |
| 2.2.3 | Vérifier : une seule requête traitée (une seule nouvelle bulle assistant, pas deux fois la même question). | | |
| 2.2.4 | Pas d’erreur affichée ; pas de saut de question. | | |

**Résumé :** Double submit ne provoque pas double traitement ni désync ? **OUI / NON**

---

### 2.3 Back / Forward (navigateur)

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 2.3.1 | Avancer jusqu’au bloc 3 (au moins une question bloc 3 affichée). | | |
| 2.3.2 | Cliquer « Retour » du navigateur (back). | | |
| 2.3.3 | Puis « Avant » (forward). | | |
| 2.3.4 | Vérifier : l’état affiché et la prochaine action (question ou miroir) restent cohérents avec l’état serveur (pas de message « question déjà répondue » ni reprise depuis une question précédente). | | |

**Résumé :** Back/forward ne corrompt pas l’état perçu ? **OUI / NON**

---

### 2.4 Latence simulée (throttle)

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 2.4.1 | Activer throttling réseau (Chrome DevTools : Slow 3G ou Custom 500 ms RTT). | | |
| 2.4.2 | Parcourir au moins bloc 2A + 2B (réponses + miroir 2B + transition 2→3). | | |
| 2.4.3 | Vérifier : pas de timeout abusif ; pas de double envoi côté front ; une seule réponse serveur par envoi ; transitions correctes. | | |
| 2.4.4 | Désactiver le throttle et terminer le parcours si besoin. | | |

**Résumé :** Comportement correct sous latence ? **OUI / NON**

---

## 3. Cohérence des routes (si les deux sont utilisables)

Si l’application peut appeler soit POST /axiom (JSON), soit POST /axiom/stream (SSE) :

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 3.1 | Même session : enchaîner 2–3 échanges en JSON puis 2–3 en stream (ou l’inverse). | | |
| 3.2 | Vérifier : pas de saut de step ; pas de perte de réponse ; currentBlock et step cohérents. | | |

**Résumé :** Comportement identique quelle que soit la route ? **OUI / NON**

---

## 4. Logs (vérification rapide)

Après une exécution de la checklist, vérifier les logs serveur (si accessibles) :

| Étape | Description | OK / KO | Note |
|-------|-------------|---------|------|
| 4.1 | Présence de [AXIOM_REQ] (ou équivalent) avec sessionId, currentBlock, step, instanceId. | | |
| 4.2 | Pour une même session, pendant un bloc 2 : un seul instanceId (si 1 replica) ou cohérence avec le choix multi-instance. | | |
| 4.3 | Aucune erreur Redis ou store dans les logs pendant le parcours. | | |

**Résumé :** Logs exploitables pour rejouer un bug ? **OUI / NON**

---

## 5. Synthèse de la session de validation

| Date | Validateur | Environnement (prod / staging) |
|------|-------------|--------------------------------|
| | | |

| Device / scénario | Parcours 1→10 | Refresh mi-bloc | Double tap | Back/Forward | Latence |
|------------------|---------------|-----------------|------------|--------------|---------|
| iPhone Safari 4G | OUI / NON | OUI / NON | OUI / NON | OUI / NON | OUI / NON |
| Desktop Chrome | OUI / NON | — | — | — | OUI / NON |
| iPad | OUI / NON | — | — | — | — |

**Validation globale :** Tous les parcours et scénarios sont OK sans régression. **OUI / NON**

**Commentaires libres :**  
(incidents, questions sautées, messages d’erreur, différences device, etc.)

---

*Checklist manuelle — à utiliser à chaque vague de correctifs de stabilité (voir AUDIT_STABILITE_GLOBALE_AXIOM.md).*
