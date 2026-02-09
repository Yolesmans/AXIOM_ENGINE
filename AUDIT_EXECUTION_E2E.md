# 🔍 AUDIT D'EXÉCUTION E2E — AXIOM ENGINE

**Date** : 2025-01-27  
**Type** : Audit sécurité et procédure d'exécution  
**Objectif** : Valider que l'exécution des tests E2E est SAFE avant lancement

---

## 1️⃣ QUEL SERVEUR AXIOM DOIT ÊTRE LANCÉ

### ✅ Réponse : Serveur LOCAL (développement)

**Preuve dans le code :**
- `e2e/runner/runE2E.ts` ligne 17 : `const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";`
- Le défaut pointe vers `localhost:3000`
- Aucune URL de production ou Railway en dur

**Recommandation :**
- Utiliser un serveur local lancé en mode développement
- **NE PAS** utiliser un serveur Railway ou de production

---

## 2️⃣ COMMANDE EXACTE POUR LANCER LE SERVEUR

### ✅ Réponse : `npm run build && npm start` OU `npx tsx src/server.ts`

**Preuve dans le code :**
- `package.json` ligne 7 : `"start": "node dist/src/server.js"`
- Le serveur doit être compilé puis lancé, OU lancé directement avec `tsx`

**Commandes possibles :**

**Option A (recommandée — build puis start) :**
```bash
npm run build
npm start
```

**Option B (développement direct) :**
```bash
npx tsx src/server.ts
```

**Vérification :**
- Le serveur doit répondre sur `http://localhost:3000`
- Vérifier avec : `curl http://localhost:3000/start?tenant=test-tenant&poste=test-poste`

---

## 3️⃣ PORT EXACT UTILISÉ PAR LES TESTS

### ✅ Réponse : Port **3000** (par défaut)

**Preuve dans le code :**
- `e2e/runner/runE2E.ts` ligne 17 : `"http://localhost:3000"`
- `src/server.ts` ligne 1002 : `const PORT = Number(process.env.PORT) || 3000;`

**Configuration :**
- Port par défaut : **3000**
- Peut être modifié via variable d'environnement `PORT` (serveur) et `API_BASE_URL` (tests)

**⚠️ IMPORTANT :**
- Si le serveur utilise un port différent, définir `API_BASE_URL` avant d'exécuter les tests :
  ```bash
  export API_BASE_URL=http://localhost:PORT_CUSTOM
  ```

---

## 4️⃣ LES TESTS PEUVENT-ILS TOUCHER LA PROD OU RAILWAY ?

### ⚠️ **OUI — RISQUE CRITIQUE SI MAL CONFIGURÉ**

**Preuve dans le code :**
- `e2e/runner/runE2E.ts` ligne 17 : `process.env.API_BASE_URL || "http://localhost:3000"`
- Si `API_BASE_URL` est défini dans l'environnement et pointe vers prod/Railway, les tests **WILL** toucher la prod

**Scénarios à risque :**

1. **Variable d'environnement définie :**
   ```bash
   export API_BASE_URL=https://axiomengine-production.up.railway.app
   npx tsx e2e/index.ts  # ❌ TOUCHE LA PROD
   ```

2. **Fichier `.env` avec `API_BASE_URL` :**
   - Si le projet charge un `.env` avec `API_BASE_URL=https://...`, les tests pointeront vers cette URL

**✅ PROTECTION RECOMMANDÉE :**

**Avant d'exécuter les tests, VÉRIFIER :**
```bash
echo $API_BASE_URL
# Doit être VIDE ou http://localhost:3000
```

**OU forcer explicitement :**
```bash
API_BASE_URL=http://localhost:3000 npx tsx e2e/index.ts
```

**Conclusion :**
- Par défaut (sans `API_BASE_URL`), les tests sont SAFE (localhost uniquement)
- Si `API_BASE_URL` pointe vers prod/Railway, les tests **WILL** créer des candidats réels en production

---

## 5️⃣ LES TESTS ÉCRIVENT-ILS DANS UNE BASE, UN STORE OU UN FICHIER ?

### ✅ **OUI — ÉCRITURE DANS LE STORE**

**Preuve dans le code :**

1. **Création de candidats :**
   - `src/server.ts` ligne 178 : `finalSessionId = uuidv4();` (nouveau candidat créé)
   - `src/server.ts` ligne 194 : `candidate = candidateStore.create(finalSessionId, tenant as string);`
   - Chaque appel `/start` crée un nouveau candidat si `sessionId` n'existe pas

2. **Persistance du store :**
   - `src/store/sessionStore.ts` ligne 38-61 : `persistCandidate()` écrit dans :
     - **Redis** (si `REDIS_URL` est défini) : clé `axiom:candidate:${candidateId}`
     - **Fichier** (si pas de Redis) : `/tmp/axiom_store.json` (ou `AXIOM_PERSIST_PATH`)

3. **Écriture des rapports E2E :**
   - `e2e/runner/runE2E.ts` lignes 207-210 : Écriture dans `e2e/reports/*.json`
   - `e2e/runner/runE2E.ts` lignes 238-241 : Écriture dans `e2e/reports/summary.md`
   - **Ces écritures sont SAFE** (dossier local uniquement)

**Impact :**
- ✅ Les rapports E2E sont écrits localement (safe)
- ⚠️ Les candidats de test sont créés dans le store (Redis ou fichier)
- ⚠️ Si Redis est configuré, les candidats seront persistés en Redis
- ⚠️ Si fichier, les candidats seront dans `/tmp/axiom_store.json` (ou `AXIOM_PERSIST_PATH`)

**Recommandation :**
- Utiliser un store isolé pour les tests (fichier local ou Redis de test)
- OU nettoyer les candidats de test après exécution

---

## 6️⃣ CE QUI SE PASSE SI UN TEST ÉCHOUE EN COURS DE ROUTE

### ✅ **LE TEST CONTINUE — AUCUNE INTERRUPTION GLOBALE**

**Preuve dans le code :**
- `e2e/runner/runE2E.ts` lignes 199-218 : Try/catch autour de chaque profil
- `e2e/runner/runE2E.ts` ligne 212 : `console.error` en cas d'erreur
- `e2e/runner/runE2E.ts` lignes 214-217 : Rapport d'erreur généré même en cas d'échec

**Comportement :**
1. Si un profil échoue :
   - L'erreur est loggée dans la console
   - Un rapport d'erreur est généré dans `e2e/reports/`
   - Le test suivant continue normalement

2. Si une requête HTTP échoue :
   - `fetch()` lèvera une exception
   - Le try/catch la capturera
   - Le profil sera marqué comme "erreur" dans le rapport
   - Le test suivant continuera

**Conclusion :**
- ✅ Aucune exception non gérée ne peut interrompre l'exécution globale
- ✅ Tous les profils sont testés même si l'un échoue
- ✅ Les erreurs sont documentées dans les rapports

---

## 7️⃣ L'EXÉCUTION E2E MODIFIE-T-ELLE L'ÉTAT DU MOTEUR OU UNIQUEMENT LIT LES RÉPONSES ?

### ⚠️ **OUI — MODIFICATION COMPLÈTE DE L'ÉTAT**

**Preuve dans le code :**

Les tests E2E appellent les routes réelles qui modifient l'état :

1. **`/start`** :
   - Crée un nouveau candidat (`candidateStore.create()`)
   - Met à jour l'état UI (`updateUIState()`)
   - Persiste dans Redis/fichier

2. **`/axiom`** :
   - Stocke les réponses utilisateur (`appendUserMessage()`, `addAnswer()`)
   - Génère des réponses assistant (`appendAssistantMessage()`)
   - Met à jour `currentBlock` (via `executeAxiom` ou `BlockOrchestrator`)
   - Met à jour l'état FSM (`updateUIState()`)
   - Appelle OpenAI (coûts réels si API key configurée)
   - Persiste dans Redis/fichier

**Impact :**
- ✅ Les tests créent des candidats **RÉELS** dans le store
- ✅ Les tests génèrent des appels OpenAI **RÉELS** (coûts)
- ✅ Les tests modifient l'état FSM **RÉEL**
- ✅ Les tests persistent dans Redis/fichier **RÉEL**

**Conclusion :**
- ❌ Les tests ne sont **PAS** en lecture seule
- ⚠️ Les tests modifient complètement l'état du moteur
- ⚠️ Les tests génèrent des coûts OpenAI réels

---

## 8️⃣ OÙ LES RAPPORTS SONT GÉNÉRÉS EXACTEMENT

### ✅ Réponse : `e2e/reports/`

**Preuve dans le code :**
- `e2e/runner/runE2E.ts` ligne 203 : `path.join(__dirname, "../profiles", file)`
- `e2e/runner/runE2E.ts` ligne 208 : `path.join(__dirname, "../reports", file.replace(".json", "_report.json"))`
- `e2e/runner/runE2E.ts` ligne 239 : `path.join(__dirname, "../reports/summary.md")`

**Fichiers générés :**

1. **`e2e/reports/candidate_tutoiement_report.json`**
   - Rapport détaillé du parcours tutoiement
   - Contient : `candidateId`, `tone`, `sessionId`, `steps[]`, `completed`

2. **`e2e/reports/candidate_vouvoiement_report.json`**
   - Rapport détaillé du parcours vouvoiement
   - Même structure

3. **`e2e/reports/summary.md`**
   - Résumé exécutif en Markdown
   - Contient : date, ton, session ID, nombre d'étapes, dernière étape, statut complété

**Chemin absolu :**
- Depuis la racine du projet : `./e2e/reports/`
- Le dossier est créé automatiquement si absent

---

## 9️⃣ CE QUE VOUS DEVEZ FAIRE MANUELLEMENT

### ✅ Checklist avant exécution

1. **Vérifier que le serveur n'est PAS en production :**
   ```bash
   echo $API_BASE_URL
   # Doit être VIDE ou http://localhost:3000
   ```

2. **Lancer le serveur AXIOM local :**
   ```bash
   # Option A (build puis start)
   npm run build
   npm start
   
   # Option B (développement direct)
   npx tsx src/server.ts
   ```

3. **Vérifier que le serveur répond :**
   ```bash
   curl "http://localhost:3000/start?tenant=test-tenant&poste=test-poste"
   # Doit retourner du JSON avec sessionId
   ```

4. **Configurer les variables d'environnement (optionnel) :**
   ```bash
   export API_BASE_URL=http://localhost:3000
   export TENANT_ID=test-tenant
   export POSTE_ID=test-poste
   ```

5. **Lancer les tests :**
   ```bash
   npx tsx e2e/index.ts
   ```

6. **Consulter les rapports :**
   ```bash
   cat e2e/reports/summary.md
   cat e2e/reports/candidate_tutoiement_report.json
   ```

---

## 🔟 CE QUE VOUS NE DEVEZ SURTOUT PAS FAIRE

### ⛔ Interdictions absolues

1. **❌ NE PAS définir `API_BASE_URL` vers prod/Railway :**
   ```bash
   # ❌ INTERDIT
   export API_BASE_URL=https://axiomengine-production.up.railway.app
   ```

2. **❌ NE PAS lancer les tests si le serveur pointe vers prod :**
   - Vérifier que `API_BASE_URL` est localhost ou vide

3. **❌ NE PAS lancer les tests sans serveur démarré :**
   - Les tests échoueront avec des erreurs de connexion
   - Mais aucun risque de corruption de données

4. **❌ NE PAS lancer les tests si Redis de production est configuré :**
   - Si `REDIS_URL` pointe vers Redis de prod, les candidats de test seront persistés en prod
   - Vérifier : `echo $REDIS_URL`

5. **❌ NE PAS lancer les tests si `OPENAI_API_KEY` n'est pas configurée (si vous voulez éviter les erreurs) :**
   - Les tests échoueront si OpenAI n'est pas accessible
   - Mais aucun risque de corruption

6. **❌ NE PAS modifier les profils pendant l'exécution :**
   - Les fichiers `e2e/profiles/*.json` sont lus au démarrage
   - Modifier pendant l'exécution n'aura pas d'effet

---

## 📋 RÉSUMÉ EXÉCUTIF — SÉCURITÉ

| Aspect | Statut | Risque |
|--------|--------|--------|
| **Serveur requis** | Local uniquement | 🟢 FAIBLE (si localhost) |
| **Port** | 3000 (défaut) | 🟢 FAIBLE |
| **Risque prod/Railway** | ⚠️ OUI si `API_BASE_URL` mal configuré | 🔴 ÉLEVÉ |
| **Écriture store** | ✅ OUI (Redis/fichier) | 🟡 MOYEN (si Redis prod) |
| **Coûts OpenAI** | ✅ OUI (appels réels) | 🟡 MOYEN |
| **Modification état** | ✅ OUI (FSM complète) | 🟡 MOYEN |
| **Rapports** | Local uniquement | 🟢 FAIBLE |
| **Gestion erreurs** | ✅ Continue même en cas d'échec | 🟢 FAIBLE |

---

## ✅ PROCÉDURE SAFE RECOMMANDÉE

### Étape 1 : Vérifications préalables

```bash
# Vérifier API_BASE_URL
echo $API_BASE_URL
# Doit être VIDE ou http://localhost:3000

# Vérifier REDIS_URL (si Redis est utilisé)
echo $REDIS_URL
# Si défini, vérifier qu'il pointe vers Redis de TEST, pas prod
```

### Étape 2 : Lancer le serveur local

```bash
# Dans un terminal
npm run build
npm start
# OU
npx tsx src/server.ts
```

### Étape 3 : Vérifier que le serveur répond

```bash
# Dans un autre terminal
curl "http://localhost:3000/start?tenant=test-tenant&poste=test-poste"
# Doit retourner du JSON
```

### Étape 4 : Lancer les tests E2E

```bash
# Forcer localhost explicitement (sécurité)
API_BASE_URL=http://localhost:3000 npx tsx e2e/index.ts
```

### Étape 5 : Consulter les rapports

```bash
cat e2e/reports/summary.md
```

---

## 🎯 CONCLUSION FINALE

### ✅ Les tests E2E sont SAFE si :

1. ✅ `API_BASE_URL` n'est PAS défini OU pointe vers `http://localhost:3000`
2. ✅ Le serveur local est démarré sur le port 3000
3. ✅ `REDIS_URL` n'est PAS défini OU pointe vers Redis de test
4. ✅ Vous acceptez les coûts OpenAI réels (appels API)

### ⚠️ Les tests E2E sont DANGEREUX si :

1. ❌ `API_BASE_URL` pointe vers prod/Railway
2. ❌ `REDIS_URL` pointe vers Redis de production
3. ❌ Le serveur local pointe vers une base de données de production

### 🛡️ Protection recommandée :

**Avant chaque exécution, exécuter :**
```bash
# Vérification sécurité
if [ "$API_BASE_URL" != "" ] && [ "$API_BASE_URL" != "http://localhost:3000" ]; then
  echo "⚠️  DANGER: API_BASE_URL pointe vers $API_BASE_URL"
  echo "❌ Ne pas lancer les tests E2E"
  exit 1
fi

# Forcer localhost
export API_BASE_URL=http://localhost:3000
npx tsx e2e/index.ts
```

---

**FIN DE L'AUDIT**
