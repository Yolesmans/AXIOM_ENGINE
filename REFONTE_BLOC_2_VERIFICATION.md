# Scénarios de vérification — Refonte BLOC 2 (state machine)

Scénarios obligatoires à valider manuellement après la refonte (pas d’E2E automatisé).

---

## Scénario 1 : Fin 2A → transition + Q0 2B → réponse "A" → Q1 correcte → jamais transition

1. Compléter le BLOC 2A (médium, préférences, œuvre noyau).
2. **Attendu :** Une seule réponse avec le texte de transition ("FIN DU BLOC 2A…", "On passe au BLOC 2B…") suivi immédiatement de la première question 2B (motif A–E).
3. Répondre **"A"** (ou B/C/D/E).
4. **Attendu :** La question suivante 2B (personnages pour la même œuvre) s’affiche. Aucun ré-affichage du message de transition.
5. Vérifier en console / Network que la réponse du serveur pour cette requête contient bien la question personnages et non le texte de transition.

---

## Scénario 2 : Multi-requête rapide → aucune régression

1. Arriver au BLOC 2 (2A ou 2B).
2. Envoyer deux réponses rapidement (double clic ou Enter deux fois).
3. **Attendu :** Pas de duplication de questions, pas de message de transition répété, pas d’erreur. L’état (blockStates, currentQuestionIndex, block2Answers) reste cohérent.

---

## Scénario 3 : Redémarrage instance → état conservé correctement

1. Compléter au moins une question 2A (ex. médium).
2. Redémarrer le backend (ou simuler un autre nœud qui charge le candidat depuis Redis).
3. Recharger la page front et reprendre (répondre à la question 2A.2, etc.).
4. **Attendu :** Les réponses déjà enregistrées (block2A.medium, etc.) sont bien présentes ; la prochaine question servie est la bonne. Aucun retour en arrière, aucun message "réponses absentes".

---

## Points de contrôle techniques

- **blockStates** : `session.blockStates['2A'].status` et `session.blockStates['2B'].status` + `currentQuestionIndex` reflètent l’avancement.
- **Réponses** : `block2Answers.block2A` (medium, preference, coreWork) et `block2Answers.block2B.answers` (liste ordonnée) sont les seules sources pour le bloc 2 ; plus d’usage de `answerMaps[2]` pour 2A/2B.
- **Persistance** : Après chaque modification d’état bloc 2, `persistAndFlush` est appelé (Redis + file) avant retour API.
