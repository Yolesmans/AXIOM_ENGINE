# RAPPORT DE DIAGNOSTIC — FRONTEND (Vercel) → BACKEND (Railway)

## 1. URL DU FRONT PUBLIC CANDIDAT

**Frontend déployé sur Vercel :**
- URL publique : `https://axiom-engine-shsk.vercel.app` (mentionnée dans les instructions)
- Fichier frontend : `ui-test/app.js` et `ui-test/index.html`

---

## 2. URL BACKEND RÉELLEMENT APPELÉE

**Configuration actuelle dans `ui-test/app.js` (ligne 2) :**
```javascript
const API_BASE_URL = "https://axiom-engine-eight.vercel.app";
```

**❌ PROBLÈME IDENTIFIÉ :**
Le frontend pointe vers **Vercel** (`axiom-engine-eight.vercel.app`) et **PAS** vers Railway (`axiomengine-production.up.railway.app`).

---

## 3. ROUTES UTILISÉES PAR LE FRONTEND

Le frontend effectue **2 types d'appels** :

### A. Route `/start` (GET)
- **Ligne 211 de `ui-test/app.js`**
- **URL complète :** `https://axiom-engine-eight.vercel.app/start?tenant={tenantId}&poste={posteId}`
- **Headers :** `Content-Type: application/json` + `x-session-id` (si sessionId existe)
- **Utilisation :** Appelé au chargement de la page pour initialiser la session

### B. Route `/axiom` (POST)
- **Ligne 52 de `ui-test/app.js`**
- **URL complète :** `https://axiom-engine-eight.vercel.app/axiom`
- **Headers :** `Content-Type: application/json` + `x-session-id: {sessionId}`
- **Body :** `{ tenantId, posteId, sessionId, message }`
- **Utilisation :** Appelé à chaque message utilisateur

---

## 4. ROUTES DISPONIBLES SUR LE BACKEND RAILWAY

**Serveur Railway :** `src/server.ts` → `dist/src/server.js`

### Routes Express disponibles (immédiates) :
- `GET /` → Retourne `{ status: "ok", service: "AXIOM_ENGINE", runtime: "railway" }`
- `GET /health` → Retourne `{ ok: true }`
- `GET /favicon.ico` → Retourne 204

### Routes Fastify (NON CHARGÉES) :
- `GET /start` → Définie dans `src/routes/start.ts` mais **JAMAIS ENREGISTRÉE** sur le serveur Railway
- `POST /axiom` → Définie dans `src/api/axiom.ts` mais **JAMAIS ENREGISTRÉE** sur le serveur Railway
- `GET /health` → Définie dans `src/api/axiom.ts` mais **JAMAIS ENREGISTRÉE** sur le serveur Railway

**⚠️ PROBLÈME CRITIQUE :**
Le serveur Railway (`src/server.ts`) fait un lazy-load de `src/index.ts`, mais `src/index.ts` ne contient **AUCUNE** route Fastify. Il ne contient qu'un serveur Express minimal.

Les routes `/start` et `/axiom` sont définies dans des fichiers séparés (`src/routes/start.ts` et `src/api/axiom.ts`) mais ne sont **jamais enregistrées** sur le serveur Railway.

---

## 5. RÉPONSES ATTENDUES VS REÇUES

### Si le frontend appelait Railway (ce qui n'est pas le cas actuellement) :

**Route `/start` :**
- **Attendu :** `{ sessionId, state, response, step, ... }`
- **Reçu actuellement :** **404 Not Found** (route inexistante sur Railway)

**Route `/axiom` :**
- **Attendu :** `{ sessionId, response, step, expectsAnswer, ... }`
- **Reçu actuellement :** **404 Not Found** (route inexistante sur Railway)

**Route `/health` :**
- **Attendu :** `{ ok: true }`
- **Reçu actuellement :** `{ ok: true }` ✅ (fonctionne car route Express)

---

## 6. CAUSE LA PLUS PROBABLE DU 502

**Cause identifiée :**

Le frontend appelle `https://axiom-engine-eight.vercel.app` (Vercel), mais :

1. **Si Vercel n'est plus déployé ou mal configuré** → 502 Bad Gateway
2. **Si Vercel redirige vers Railway** → 502 car Railway n'a pas les routes `/start` et `/axiom` enregistrées

**Problème architectural :**
- Le serveur Railway (`src/server.ts`) utilise Express et charge `src/index.ts` en lazy-load
- `src/index.ts` ne contient pas les routes Fastify (`/start`, `/axiom`)
- Les routes Fastify existent dans le code mais ne sont jamais montées sur le serveur Railway

---

## 7. RECOMMANDATION UNIQUE

**Modifier `ui-test/app.js` ligne 2 :**

**AVANT :**
```javascript
const API_BASE_URL = "https://axiom-engine-eight.vercel.app";
```

**APRÈS :**
```javascript
const API_BASE_URL = "https://axiomengine-production.up.railway.app";
```

**⚠️ MAIS ATTENTION :** Cette modification ne résoudra le problème que si les routes `/start` et `/axiom` sont correctement enregistrées sur le serveur Railway. Actuellement, ces routes n'existent pas sur Railway, donc le frontend recevra des **404 Not Found** au lieu de **502 Bad Gateway**.

**Action complémentaire nécessaire :** Enregistrer les routes Fastify (`/start`, `/axiom`) sur le serveur Railway en modifiant `src/server.ts` ou `src/index.ts` pour qu'elles soient montées correctement.

---

## RÉSUMÉ EXÉCUTIF

| Élément | État |
|---------|------|
| Frontend URL | `https://axiom-engine-shsk.vercel.app` |
| Backend appelé actuellement | `https://axiom-engine-eight.vercel.app` (Vercel) |
| Backend cible | `https://axiomengine-production.up.railway.app` (Railway) |
| Routes frontend | `/start` (GET), `/axiom` (POST) |
| Routes Railway disponibles | `/`, `/health`, `/favicon.ico` uniquement |
| Routes manquantes sur Railway | `/start`, `/axiom` |
| Cause 502 | Frontend pointe vers Vercel (potentiellement down) OU routes non enregistrées sur Railway |
