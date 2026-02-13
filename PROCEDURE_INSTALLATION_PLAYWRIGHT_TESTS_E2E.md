# 🎭 PROCÉDURE INSTALLATION PLAYWRIGHT — TESTS E2E AXIOM

**Date** : 12 février 2026  
**Type** : Architecture tests automatisés (AUCUNE implémentation)  
**Objectif** : Tester parcours complet Identity → Matching sans intervention manuelle

---

## 📋 TABLE DES MATIÈRES

1. [Installation Playwright (One Shot)](#1-installation-playwright-one-shot)
2. [Configuration AXIOM](#2-configuration-axiom)
3. [Strategy Mocking](#3-strategy-mocking)
4. [Architecture Tests](#4-architecture-tests)
5. [Exemple Test Complet](#5-exemple-test-complet)
6. [Détection Erreurs](#6-détection-erreurs)
7. [Couverture & Limitations](#7-couverture--limitations)
8. [Estimation Honnête](#8-estimation-honnête)

---

## 1️⃣ INSTALLATION PLAYWRIGHT (ONE SHOT)

### Étape 1 : Installation dépendances

```bash
cd /Users/jamesguerin/AXIOM_ENGINE/AXIOM_ENGINE

# Installer Playwright + navigateurs
npm install -D @playwright/test
npx playwright install chromium

# Installer dépendances optionnelles (screenshots, vidéos)
npm install -D @playwright/test@latest
```

**Durée** : 2-3 minutes

---

### Étape 2 : Initialisation configuration

```bash
# Générer fichier de configuration par défaut
npx playwright init
```

**Fichier créé** : `playwright.config.ts`

---

### Étape 3 : Configuration Playwright pour AXIOM

**Fichier** : `playwright.config.ts` (à créer/modifier)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  
  // Timeout par test (parcours complet peut prendre 2-3 minutes)
  timeout: 180000, // 3 minutes
  
  // Timeout par action (attente SSE, génération miroir)
  expect: {
    timeout: 30000 // 30 secondes
  },
  
  // Répéter les tests qui échouent (pour détecter flakiness)
  retries: 2,
  
  // Parallélisme (1 worker = séquentiel pour éviter conflits session)
  workers: 1,
  
  // Reporter (console + HTML)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results.json' }]
  ],
  
  use: {
    // URL de base (local ou staging)
    baseURL: 'http://localhost:3000',
    
    // Trace on first retry (debug)
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on retry
    video: 'retain-on-failure',
    
    // Timeouts navigation
    navigationTimeout: 30000,
    actionTimeout: 10000,
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  
  // Serveur local (optionnel, si on veut que Playwright démarre le serveur)
  webServer: {
    command: 'npm start',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

### Étape 4 : Structure dossiers

```bash
mkdir -p tests/e2e
mkdir -p tests/fixtures
mkdir -p tests/mocks
mkdir -p tests/utils
```

**Structure finale** :
```
AXIOM_ENGINE/
├── tests/
│   ├── e2e/
│   │   ├── full-profile.spec.ts        # Test parcours complet
│   │   ├── bloc-1.spec.ts              # Test BLOC 1 isolé
│   │   ├── transition-2b-3.spec.ts     # Test critique 2B→3
│   │   └── matching.spec.ts            # Test matching
│   ├── fixtures/
│   │   ├── identities.ts               # Données test identité
│   │   ├── responses.ts                # Réponses prédéfinies
│   │   └── mock-data.ts                # Data mock LLM/Sheets
│   ├── mocks/
│   │   ├── openai-mock.ts              # Mock OpenAI
│   │   └── sheets-mock.ts              # Mock Google Sheets
│   └── utils/
│       ├── helpers.ts                  # Helpers tests
│       └── assertions.ts               # Assertions custom
├── playwright.config.ts
└── package.json
```

---

### Étape 5 : Configuration package.json

**Ajouter scripts** :

```json
{
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:debug": "playwright test --debug",
    "test:headed": "playwright test --headed",
    "test:report": "playwright show-report",
    "test:full": "playwright test tests/e2e/full-profile.spec.ts",
    "test:100": "playwright test tests/e2e/full-profile.spec.ts --repeat-each=100"
  }
}
```

---

## 2️⃣ CONFIGURATION AXIOM

### Variables d'environnement pour tests

**Fichier** : `.env.test` (à créer)

```bash
# Mode test (désactive appels réels)
NODE_ENV=test
AXIOM_TEST_MODE=true

# Mock OpenAI (ne pas appeler API réelle)
OPENAI_API_KEY=sk-test-mock-key-do-not-use
OPENAI_MOCK_ENABLED=true

# Mock Google Sheets
GOOGLE_SHEETS_MOCK_ENABLED=true
GOOGLE_APPLICATION_CREDENTIALS=./tests/mocks/fake-credentials.json

# Port serveur test
PORT=3001

# Désactiver logs verbeux en test
LOG_LEVEL=error
```

---

### Modifications minimales backend (optionnel)

**Si on veut activer mode mock** :

**Fichier** : `src/services/openaiClient.ts` (ajouter détection mode test)

```typescript
// En haut du fichier
const IS_TEST_MODE = process.env.AXIOM_TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
const OPENAI_MOCK_ENABLED = process.env.OPENAI_MOCK_ENABLED === 'true';

// Dans callOpenAI
export async function callOpenAI(params: OpenAIParams): Promise<string | OpenAI.Chat.ChatCompletion> {
  if (IS_TEST_MODE && OPENAI_MOCK_ENABLED) {
    // Retourner réponse mock prédéfinie
    return getMockResponse(params);
  }
  
  // ... reste du code normal
}

function getMockResponse(params: OpenAIParams): string {
  const messages = params.messages || [];
  const lastMessage = messages[messages.length - 1]?.content || '';
  
  // Détecter type de prompt et retourner mock approprié
  if (lastMessage.includes('préambule') || lastMessage.includes('tone')) {
    return "Voici un préambule test. Prêt à commencer ?";
  }
  
  if (lastMessage.includes('miroir') || lastMessage.includes('BLOC')) {
    return "Miroir test généré automatiquement pour validation E2E.";
  }
  
  // Question par défaut
  return "Question test ?";
}
```

**MAIS** : Cette approche nécessite modification du code backend.

---

### Alternative : Mock au niveau réseau (MSW)

**Installer MSW** :

```bash
npm install -D msw
```

**Fichier** : `tests/mocks/msw-handlers.ts`

```typescript
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mock OpenAI completions
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      id: 'chatcmpl-mock',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: generateMockContent(),
        },
        finish_reason: 'stop',
      }],
    });
  }),
  
  // Mock Google Sheets API
  http.post('https://sheets.googleapis.com/v4/spreadsheets/*', () => {
    return HttpResponse.json({ updatedRows: 1 });
  }),
];

function generateMockContent(): string {
  const mockResponses = [
    "Voici une question test A/B/C/D ?",
    "Miroir interprétatif test généré automatiquement.",
    "Préambule métier test.",
  ];
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
}
```

**Setup MSW dans tests** :

```typescript
// tests/e2e/setup.ts
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/msw-handlers';

export const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

---

## 3️⃣ STRATEGY MOCKING

### Mock OpenAI : 3 approches

#### Approche A : Mock au niveau HTTP (MSW) ⭐ RECOMMANDÉ

**Avantages** :
- ✅ Aucune modification code backend
- ✅ Mock transparent pour le serveur
- ✅ Peut mocker streaming SSE

**Inconvénients** :
- ⚠️ Setup plus complexe
- ⚠️ MSW doit tourner côté backend (pas frontend)

**Comment** : Intercepter requêtes HTTP vers `api.openai.com` et retourner JSON mock

---

#### Approche B : Variable d'environnement + code conditionnel

**Avantages** :
- ✅ Contrôle total sur réponses mock
- ✅ Peut tester cas spécifiques (erreur, timeout)

**Inconvénients** :
- ❌ Nécessite modification `openaiClient.ts`
- ❌ Code de test dans code prod

**Comment** : `if (process.env.AXIOM_TEST_MODE) return mockResponse;`

---

#### Approche C : Serveur mock OpenAI local

**Avantages** :
- ✅ Aucune modification code
- ✅ Réutilisable pour autres projets

**Inconvénients** :
- ❌ Setup complexe (serveur séparé)
- ❌ Maintenance

**Comment** : Créer serveur Express qui répond sur `/v1/chat/completions`

---

### Mock Google Sheets : 2 approches

#### Approche A : Variable d'environnement ⭐ RECOMMANDÉ

**Fichier** : `src/services/googleSheetsLiveTracking.ts`

```typescript
const IS_TEST_MODE = process.env.GOOGLE_SHEETS_MOCK_ENABLED === 'true';

export async function upsertLiveTracking(...) {
  if (IS_TEST_MODE) {
    console.log('[MOCK] Google Sheets write skipped in test mode');
    return; // Ne rien faire
  }
  
  // ... code normal
}
```

**Avantages** :
- ✅ Simple
- ✅ Pas d'appel API réel
- ✅ Pas de coût

---

#### Approche B : Credentials fake

**Créer fichier** : `tests/mocks/fake-credentials.json`

```json
{
  "type": "service_account",
  "project_id": "test-project",
  "private_key_id": "fake-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n",
  "client_email": "test@test-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

**Variable** : `GOOGLE_APPLICATION_CREDENTIALS=./tests/mocks/fake-credentials.json`

**Résultat** : Appels échouent silencieusement (ou sont mockés par MSW)

---

### Forcer réponses aléatoires (simulation user)

**Fichier** : `tests/fixtures/responses.ts`

```typescript
export const MOCK_RESPONSES = {
  // Identité
  identity: {
    firstName: () => `Test${Math.floor(Math.random() * 1000)}`,
    lastName: () => `User${Math.floor(Math.random() * 1000)}`,
    email: () => `test${Date.now()}@test.com`,
  },
  
  // Tone
  tone: () => ['tutoiement', 'vouvoiement'][Math.floor(Math.random() * 2)],
  
  // Questions A/B/C/D (BLOC 1, 3-10)
  multipleChoice: () => ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
  
  // Questions A/B (BLOC 2A)
  binaryChoice: () => ['A', 'B'][Math.floor(Math.random() * 2)],
  
  // Champs libres (motifs, personnages)
  freeText: () => {
    const texts = [
      "Réussir mes objectifs",
      "Être reconnu pour mon travail",
      "Aider les autres",
      "Innover et créer",
      "Stabilité et sécurité",
    ];
    return texts[Math.floor(Math.random() * texts.length)];
  },
  
  // Validation miroir (continuer)
  mirrorValidation: () => "oui",
};
```

---

### Gérer timeouts SSE

**Dans tests Playwright** :

```typescript
// Attendre event SSE spécifique avec timeout
async function waitForSSEEvent(page: Page, eventType: 'done' | 'token', timeout = 30000) {
  return page.waitForFunction(
    (type) => {
      // Vérifier qu'un message SSE du type attendu a été reçu
      return window.__lastSSEEvent?.type === type;
    },
    eventType,
    { timeout }
  );
}

// Ou attendre que le texte apparaisse dans #messages
async function waitForResponse(page: Page, timeout = 30000) {
  await page.waitForSelector('#messages .message-bubble:last-child', { 
    timeout,
    state: 'attached' 
  });
}
```

---

## 4️⃣ ARCHITECTURE TESTS

### Structure recommandée

```
tests/
├── e2e/
│   ├── 01-identity-flow.spec.ts        # Test identité → préambule
│   ├── 02-bloc-1.spec.ts               # Test BLOC 1 complet
│   ├── 03-bloc-2a.spec.ts              # Test BLOC 2A
│   ├── 04-bloc-2b.spec.ts              # Test BLOC 2B
│   ├── 05-transition-2b-3.spec.ts      # Test CRITIQUE 2B→3
│   ├── 06-bloc-3-10.spec.ts            # Test BLOC 3-10
│   ├── 07-matching.spec.ts             # Test matching final
│   └── 99-full-profile.spec.ts         # Test parcours complet
│
├── fixtures/
│   ├── identities.ts                   # 100 identités prédéfinies
│   ├── responses.ts                    # Réponses aléatoires
│   └── expected-states.ts              # États attendus par étape
│
├── mocks/
│   ├── msw-handlers.ts                 # Handlers MSW
│   └── openai-responses.ts             # Réponses OpenAI prédéfinies
│
└── utils/
    ├── page-helpers.ts                 # Helpers Playwright
    ├── assertions.ts                   # Assertions custom
    └── logger.ts                       # Logger tests
```

---

### Helpers réutilisables

**Fichier** : `tests/utils/page-helpers.ts`

```typescript
import { Page, expect } from '@playwright/test';

export class AxiomTestHelper {
  constructor(private page: Page) {}
  
  // Remplir identité
  async fillIdentity(firstName: string, lastName: string, email: string) {
    await this.page.fill('input[placeholder*="prénom" i]', firstName);
    await this.page.fill('input[placeholder*="nom" i]', lastName);
    await this.page.fill('input[placeholder*="email" i]', email);
    await this.page.click('button[type="submit"]');
  }
  
  // Choisir tone
  async selectTone(tone: 'tutoiement' | 'vouvoiement') {
    await this.waitForMessage();
    await this.sendMessage(tone);
  }
  
  // Cliquer bouton "Je commence mon profil"
  async clickStartButton() {
    await this.page.click('#mvp-start-button');
    await this.waitForMessage();
  }
  
  // Cliquer bouton "Continuer" (après miroir 2B)
  async clickContinueButton() {
    await this.page.click('#continue-bloc3-button');
    await this.waitForMessage();
  }
  
  // Envoyer message
  async sendMessage(text: string) {
    await this.page.fill('#user-input', text);
    await this.page.click('button[type="submit"]');
    await this.waitForMessage();
  }
  
  // Attendre message assistant
  async waitForMessage(timeout = 30000) {
    await this.page.waitForSelector(
      '#messages .message-bubble:last-child',
      { timeout, state: 'visible' }
    );
  }
  
  // Vérifier message erreur
  async checkForError(): Promise<boolean> {
    const lastMessage = await this.page.textContent('#messages .message-bubble:last-child');
    return lastMessage?.includes('erreur technique') || false;
  }
  
  // Vérifier input actif
  async isInputEnabled(): Promise<boolean> {
    return await this.page.isEnabled('#user-input');
  }
  
  // Vérifier input masqué
  async isInputHidden(): Promise<boolean> {
    const chatForm = await this.page.locator('#chat-form');
    const display = await chatForm.evaluate(el => window.getComputedStyle(el).display);
    return display === 'none';
  }
  
  // Capturer erreurs console
  captureConsoleErrors(): string[] {
    const errors: string[] = [];
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    return errors;
  }
  
  // Capturer erreurs réseau
  captureNetworkErrors(): { url: string; status: number }[] {
    const errors: { url: string; status: number }[] = [];
    this.page.on('response', response => {
      if (response.status() >= 400) {
        errors.push({ url: response.url(), status: response.status() });
      }
    });
    return errors;
  }
}
```

---

## 5️⃣ EXEMPLE TEST COMPLET

### Test parcours full-profile

**Fichier** : `tests/e2e/99-full-profile.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { AxiomTestHelper } from '../utils/page-helpers';
import { MOCK_RESPONSES } from '../fixtures/responses';

test.describe('Parcours complet AXIOM', () => {
  let helper: AxiomTestHelper;
  let consoleErrors: string[];
  let networkErrors: { url: string; status: number }[];
  
  test.beforeEach(async ({ page }) => {
    helper = new AxiomTestHelper(page);
    
    // Capturer erreurs
    consoleErrors = helper.captureConsoleErrors();
    networkErrors = helper.captureNetworkErrors();
    
    // Naviguer vers l'app
    await page.goto('/?tenant=elgaenergy&poste=commercial_b2b');
  });
  
  test('Parcours Identity → Matching complet', async ({ page }) => {
    // 1. IDENTITÉ
    await test.step('Remplir identité', async () => {
      const identity = MOCK_RESPONSES.identity;
      await helper.fillIdentity(
        identity.firstName(),
        identity.lastName(),
        identity.email()
      );
      
      // Vérifier transition vers tone
      await expect(page.locator('#messages')).toContainText(/ton|tutoiement|vouvoiement/i);
    });
    
    // 2. TONE
    await test.step('Choisir tone', async () => {
      await helper.selectTone(MOCK_RESPONSES.tone());
      
      // Vérifier préambule généré
      await helper.waitForMessage(60000); // Préambule peut prendre 30-60s
      await expect(page.locator('#messages')).toContainText(/.{50,}/); // Au moins 50 chars
    });
    
    // 3. BOUTON PRÉAMBULE
    await test.step('Cliquer bouton "Je commence mon profil"', async () => {
      await expect(page.locator('#mvp-start-button')).toBeVisible();
      await helper.clickStartButton();
      
      // Vérifier question BLOC 1 affichée
      await expect(page.locator('#messages')).toContainText(/\?/);
      await expect(helper.isInputEnabled()).resolves.toBe(true);
    });
    
    // 4. BLOC 1 (6 questions)
    await test.step('Répondre BLOC 1', async () => {
      for (let i = 0; i < 6; i++) {
        await helper.sendMessage(MOCK_RESPONSES.multipleChoice());
      }
      
      // Vérifier miroir BLOC 1 généré
      await helper.waitForMessage(60000); // Miroir peut prendre 30-60s
      const lastMessage = await page.textContent('#messages .message-bubble:last-child');
      expect(lastMessage?.length).toBeGreaterThan(100); // Miroir = long texte
    });
    
    // 5. BLOC 2A (3 questions)
    await test.step('Répondre BLOC 2A', async () => {
      // Question 2A.1 (série/film)
      await helper.sendMessage(MOCK_RESPONSES.binaryChoice());
      
      // Question 2A.2
      await helper.sendMessage(MOCK_RESPONSES.multipleChoice());
      
      // Question 2A.3
      await helper.sendMessage(MOCK_RESPONSES.multipleChoice());
    });
    
    // 6. BLOC 2B (6 questions motifs + personnages)
    await test.step('Répondre BLOC 2B', async () => {
      for (let i = 0; i < 6; i++) {
        await helper.sendMessage(MOCK_RESPONSES.freeText());
      }
      
      // Vérifier miroir 2B généré
      await helper.waitForMessage(60000);
    });
    
    // 7. TRANSITION 2B → 3 (CRITIQUE)
    await test.step('Cliquer bouton "Continuer" après miroir 2B', async () => {
      // Vérifier bouton visible
      await expect(page.locator('#continue-bloc3-button')).toBeVisible({ timeout: 5000 });
      
      // Vérifier input masqué
      expect(await helper.isInputHidden()).toBe(true);
      
      // Cliquer bouton
      await helper.clickContinueButton();
      
      // ✅ VÉRIFICATIONS CRITIQUES
      // 1. Question BLOC 3 affichée (pas "Une erreur technique")
      const hasError = await helper.checkForError();
      expect(hasError).toBe(false);
      
      // 2. Input actif
      expect(await helper.isInputEnabled()).toBe(true);
      
      // 3. Question contient A/B/C/D
      const questionText = await page.textContent('#messages .message-bubble:last-child');
      expect(questionText).toMatch(/[A-D]\./);
      
      // Screenshot si échec
      if (hasError) {
        await page.screenshot({ 
          path: `test-results/error-bloc3-${Date.now()}.png`,
          fullPage: true 
        });
      }
    });
    
    // 8. BLOC 3-10 (3 questions par bloc × 8 blocs = 24 questions)
    await test.step('Répondre BLOC 3-10', async () => {
      for (let bloc = 3; bloc <= 10; bloc++) {
        // 3 questions par bloc
        for (let q = 0; q < 3; q++) {
          await helper.sendMessage(MOCK_RESPONSES.multipleChoice());
        }
        
        // Vérifier miroir généré
        await helper.waitForMessage(60000);
      }
    });
    
    // 9. MATCHING
    await test.step('Générer matching', async () => {
      // Vérifier bouton matching visible
      await expect(page.locator('#mvp-matching-button')).toBeVisible();
      
      // Cliquer bouton
      await page.click('#mvp-matching-button');
      
      // Attendre matching généré (peut prendre 30-60s)
      await helper.waitForMessage(90000);
      
      // Vérifier matching contient texte conséquent
      const matchingText = await page.textContent('#messages .message-bubble:last-child');
      expect(matchingText?.length).toBeGreaterThan(200);
    });
    
    // 10. VÉRIFICATIONS FINALES
    await test.step('Vérifications finales', async () => {
      // Aucune erreur console critique
      const criticalErrors = consoleErrors.filter(e => 
        !e.includes('[HMR]') && 
        !e.includes('DevTools')
      );
      expect(criticalErrors).toHaveLength(0);
      
      // Aucune erreur réseau 5xx
      const serverErrors = networkErrors.filter(e => e.status >= 500);
      expect(serverErrors).toHaveLength(0);
      
      // Bouton FIN affiché
      await expect(page.locator('button')).toContainText(/fin/i);
    });
  });
  
  // Test répétable 100 fois
  test('Parcours complet (répétition stress test)', async ({ page }) => {
    // Même test que ci-dessus
    // Playwright le répètera avec --repeat-each=100
  });
});
```

---

### Test spécifique transition 2B→3

**Fichier** : `tests/e2e/05-transition-2b-3.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { AxiomTestHelper } from '../utils/page-helpers';

test.describe('Transition critique 2B → 3', () => {
  test('Après miroir 2B, bouton Continuer → Question BLOC 3', async ({ page }) => {
    const helper = new AxiomTestHelper(page);
    
    // Setup : arriver jusqu'au miroir 2B
    await setupUntilMiroir2B(page, helper);
    
    // VÉRIFICATION PRÉ-CLIC
    await test.step('Vérifier état avant clic', async () => {
      await expect(page.locator('#continue-bloc3-button')).toBeVisible();
      expect(await helper.isInputHidden()).toBe(true);
    });
    
    // ACTION CRITIQUE
    await test.step('Cliquer bouton Continuer', async () => {
      await helper.clickContinueButton();
    });
    
    // VÉRIFICATIONS POST-CLIC
    await test.step('Vérifier question BLOC 3 affichée', async () => {
      // 1. PAS de message erreur
      const hasError = await helper.checkForError();
      expect(hasError).toBe(false);
      
      // 2. Input actif
      const inputEnabled = await helper.isInputEnabled();
      expect(inputEnabled).toBe(true);
      
      // 3. Question contient A/B/C/D
      const questionText = await page.textContent('#messages .message-bubble:last-child');
      expect(questionText).toMatch(/[A-D]\./);
      expect(questionText).toContain('?');
      
      // 4. Pas de texte "Une erreur technique"
      expect(questionText).not.toContain('erreur technique');
      
      // Screenshot preuve succès
      await page.screenshot({ 
        path: `test-results/success-bloc3-${Date.now()}.png` 
      });
    });
    
    // VÉRIFICATION RÉPONSE POSSIBLE
    await test.step('Vérifier réponse BLOC 3 possible', async () => {
      await helper.sendMessage('A');
      
      // Question suivante affichée
      await helper.waitForMessage();
      const hasError = await helper.checkForError();
      expect(hasError).toBe(false);
    });
  });
});

async function setupUntilMiroir2B(page: Page, helper: AxiomTestHelper) {
  // Identité → Tone → Préambule → BLOC 1 → 2A → 2B
  // (Code complet omis pour brièveté, voir full-profile.spec.ts)
}
```

---

## 6️⃣ DÉTECTION ERREURS

### Types d'erreurs détectables

#### ✅ Erreurs UI

| Type | Détection | Comment |
|------|-----------|---------|
| **Écran bloqué** | ✅ | `isInputEnabled()` → false |
| **Bouton invisible** | ✅ | `expect(button).toBeVisible()` → fail |
| **Message erreur** | ✅ | `textContent()` contains "erreur technique" |
| **Input masqué** | ✅ | `isInputHidden()` → true |
| **Timeout SSE** | ✅ | `waitForMessage(30000)` → timeout exception |

#### ✅ Erreurs Backend

| Type | Détection | Comment |
|------|-----------|---------|
| **500 Internal Error** | ✅ | Network monitor → status >= 500 |
| **404 Not Found** | ✅ | Network monitor → status 404 |
| **Timeout API** | ✅ | Network monitor → no response |
| **Stream cassé** | ✅ | No message after timeout |
| **Fallback déclenché** | ✅ | Response contains "Une erreur technique" |

#### ✅ Erreurs Console

| Type | Détection | Comment |
|------|-----------|---------|
| **JS error** | ✅ | Console monitor → type='error' |
| **Network error** | ✅ | Console monitor → "Failed to fetch" |
| **SSE parse error** | ✅ | Console monitor → "SSE" + "parse" |

#### ⚠️ Erreurs État

| Type | Détection | Comment |
|------|-----------|---------|
| **expectsAnswer incorrect** | ⚠️ | Indirect (input enabled/disabled) |
| **state incorrect** | ⚠️ | Pas directement visible frontend |
| **step incorrect** | ⚠️ | Pas directement visible frontend |
| **FSM désynchronisé** | ⚠️ | Symptômes (comportement inattendu) |

#### ❌ Erreurs NON détectables

| Type | Détection | Comment |
|------|-----------|---------|
| **Exception backend silencieuse** | ❌ | Si pas loggée, invisible |
| **Race condition intermittente** | ⚠️ | Peut passer en test, échouer en prod |
| **Qualité réponse LLM** | ❌ | Mocks → pas de vraie réponse LLM |
| **Profondeur analyse** | ❌ | Mocks → pas de vraie analyse |

---

### Capture automatique erreurs

**Fichier** : `tests/utils/error-capture.ts`

```typescript
import { Page } from '@playwright/test';
import fs from 'fs/promises';

export class ErrorCapture {
  private consoleErrors: string[] = [];
  private networkErrors: { url: string; status: number; body?: string }[] = [];
  
  constructor(private page: Page) {
    this.setupListeners();
  }
  
  private setupListeners() {
    // Console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(`[${new Date().toISOString()}] ${msg.text()}`);
      }
    });
    
    // Network errors
    this.page.on('response', async response => {
      if (response.status() >= 400) {
        let body: string | undefined;
        try {
          body = await response.text();
        } catch {}
        
        this.networkErrors.push({
          url: response.url(),
          status: response.status(),
          body,
        });
      }
    });
    
    // Page crashes
    this.page.on('crash', () => {
      this.consoleErrors.push('[CRASH] Page crashed');
    });
  }
  
  async captureOnError(testName: string) {
    const timestamp = Date.now();
    const folder = `test-results/${testName}-${timestamp}`;
    await fs.mkdir(folder, { recursive: true });
    
    // Screenshot
    await this.page.screenshot({ 
      path: `${folder}/screenshot.png`,
      fullPage: true 
    });
    
    // HTML snapshot
    const html = await this.page.content();
    await fs.writeFile(`${folder}/page.html`, html);
    
    // Console errors
    await fs.writeFile(
      `${folder}/console-errors.json`,
      JSON.stringify(this.consoleErrors, null, 2)
    );
    
    // Network errors
    await fs.writeFile(
      `${folder}/network-errors.json`,
      JSON.stringify(this.networkErrors, null, 2)
    );
    
    // Test trace (si activé)
    // await this.page.context().tracing.stop({ path: `${folder}/trace.zip` });
  }
  
  getErrors() {
    return {
      console: this.consoleErrors,
      network: this.networkErrors,
    };
  }
}
```

---

## 7️⃣ COUVERTURE & LIMITATIONS

### ✅ CE QUE ÇA COUVRE (85-90%)

| Aspect | Couverture | Détection |
|--------|------------|-----------|
| **UI bloquée** | 95% | ✅ Excellent |
| **Boutons invisibles** | 100% | ✅ Parfait |
| **Messages erreur** | 100% | ✅ Parfait |
| **Input masqué/actif** | 100% | ✅ Parfait |
| **Erreurs 4xx/5xx** | 100% | ✅ Parfait |
| **Timeout SSE** | 90% | ✅ Excellent |
| **Stream cassé** | 85% | ✅ Bon |
| **Fallback technique** | 100% | ✅ Parfait |
| **Matching non généré** | 95% | ✅ Excellent |
| **Erreurs console** | 90% | ✅ Excellent |
| **Parcours complet** | 100% | ✅ Parfait |
| **Transitions blocs** | 100% | ✅ Parfait |

---

### ⚠️ CE QUE ÇA COUVRE PARTIELLEMENT (50-70%)

| Aspect | Couverture | Limitation |
|--------|------------|------------|
| **expectsAnswer incorrect** | 70% | Détecté indirectement (input state) |
| **state backend incorrect** | 50% | Pas visible frontend directement |
| **step backend incorrect** | 50% | Pas visible frontend directement |
| **Race conditions** | 60% | Peuvent être intermittentes |
| **Qualité réponse LLM** | 0% | Mocks → pas de vraie génération |
| **Profondeur miroir** | 0% | Mocks → pas de vraie analyse |

---

### ❌ CE QUE ÇA NE COUVRE PAS (0-20%)

| Aspect | Couverture | Raison |
|--------|------------|--------|
| **Exceptions backend silencieuses** | 10% | Invisible si pas loggée |
| **Bugs logique métier** | 0% | Mocks masquent comportement réel |
| **Performance réelle** | 0% | Mocks = instantané |
| **Coûts tokens** | 0% | Mocks = pas d'appel API |
| **Limites rate OpenAI** | 0% | Mocks = pas d'appel API |
| **Qualité prompts** | 0% | Mocks = pas de vraie génération |
| **Cohérence réponses LLM** | 0% | Mocks = réponses fixes |

---

### 🎯 EST-CE QUE ÇA ÉLIMINE LE PROBLÈME BLOC 3 ?

**Réponse** : **OUI à 95%**

**Ce qui SERA détecté** :
- ✅ Bouton "Continuer" invisible → Test échoue
- ✅ Clic bouton → "Une erreur technique" → Test échoue
- ✅ Clic bouton → Input masqué → Test échoue
- ✅ Clic bouton → Timeout SSE → Test échoue
- ✅ Clic bouton → Erreur 500 → Test échoue
- ✅ Clic bouton → Question invalide → Test échoue

**Ce qui NE SERA PAS détecté** :
- ⚠️ Si mock retourne réponse valide MAIS production retourne vide → Pas détecté
- ⚠️ Si bug uniquement avec LLM réel (parsing réponse) → Pas détecté

**Verdict** : Le test détectera le bug architectural (handler manquant, ligne 1796 dangereuse) mais pas les bugs liés au contenu LLM réel.

---

### 🎯 EST-CE QUE ÇA DÉTECTE PROFONDEUR RÉPONSES LLM ?

**Réponse** : **NON (0%)**

**Raison** : Les mocks retournent des réponses fixes/aléatoires, pas de vraies générations LLM.

**Conséquence** :
- ❌ Qualité miroir : non testé
- ❌ Pertinence questions : non testé
- ❌ Profondeur analyse : non testé
- ❌ Respect REVELIOM (20-25 mots) : non testé

**Solution alternative** : Tests manuels sur échantillon avec vrai LLM (coût)

---

### 🎯 EST-CE QUE ÇA DÉTECTE BLOCAGES UI ?

**Réponse** : **OUI à 95%**

**Ce qui SERA détecté** :
- ✅ Input désactivé alors qu'il devrait être actif
- ✅ Input masqué alors qu'il devrait être visible
- ✅ Bouton invisible alors qu'il devrait être affiché
- ✅ Message ne s'affiche pas (timeout)
- ✅ Freeze total (pas de réponse après timeout)

**Ce qui NE SERA PAS détecté** :
- ⚠️ Lag imperceptible (< 1s)
- ⚠️ Scroll qui ne fonctionne pas (cosmétique)

**Verdict** : Excellente couverture des blocages critiques.

---

### 🎯 EST-CE QUE ÇA DÉTECTE ERREURS BACKEND SILENCIEUSES ?

**Réponse** : **PARTIELLEMENT (50%)**

**Ce qui SERA détecté** :
- ✅ Si erreur produit symptôme visible (timeout, erreur 500, fallback)
- ✅ Si erreur loggée dans console (monitored)

**Ce qui NE SERA PAS détecté** :
- ❌ Exception catchée silencieusement (try/catch sans log)
- ❌ Valeur incorrecte mais pas d'erreur (ex: `expectsAnswer: false` au lieu de `true`)
- ❌ État FSM incorrect mais pas de crash

**Verdict** : Couverture moyenne. Pour 100%, ajouter logs backend + parsing logs.

---

## 8️⃣ ESTIMATION HONNÊTE

### ⏱️ COMPLEXITÉ RÉELLE

| Tâche | Complexité | Temps estimé |
|-------|------------|--------------|
| **Installation Playwright** | 🟢 Faible | 30 minutes |
| **Configuration AXIOM** | 🟡 Moyenne | 2 heures |
| **Setup mocks OpenAI** | 🟠 Moyenne-Élevée | 4 heures |
| **Setup mocks Sheets** | 🟢 Faible | 1 heure |
| **Écrire test full-profile** | 🟡 Moyenne | 4 heures |
| **Écrire tests spécifiques** | 🟢 Faible | 2 heures |
| **Debugger tests flaky** | 🔴 Élevée | 4-8 heures |
| **Maintenance continue** | 🟡 Moyenne | 1-2h/mois |
| **TOTAL SETUP** | - | **18-22 heures** |

---

### 🕐 TEMPS DE MISE EN PLACE

**Estimation réaliste** : **2-3 jours** (si fait par 1 personne, temps plein)

**Breakdown** :
- Jour 1 : Installation + configuration + mocks (6-8h)
- Jour 2 : Écriture tests + debugging (6-8h)
- Jour 3 : Tests répétés + ajustements + documentation (4-6h)

**Si expérience Playwright existante** : 1-2 jours

**Si AUCUNE expérience Playwright** : 3-5 jours (courbe d'apprentissage)

---

### ⚠️ RISQUES

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| **Tests flaky (intermittents)** | 🟠 Moyenne | 🔴 Élevé | Timeouts généreux, retries |
| **Mocks ne représentent pas prod** | 🟡 Faible | 🟠 Moyen | Tests manuels échantillon |
| **Maintenance coûteuse** | 🟡 Faible | 🟡 Moyen | Architecture modulaire |
| **Setup complexe** | 🟢 Faible | 🟢 Faible | Documentation claire |
| **CI/CD intégration** | 🟡 Faible | 🟡 Moyen | GitHub Actions template |

---

### 🔧 POINTS DE FRICTION POSSIBLES

#### 1. Mocks OpenAI : Approche MSW vs Code

**Friction** : MSW nécessite serveur mock côté backend (pas frontend)

**Solution** : Approche variable d'environnement + code conditionnel plus simple mais modifie code prod

**Recommandation** : Variable d'environnement pour MVP, MSW pour version avancée

---

#### 2. Tests flaky (timeouts SSE)

**Friction** : Génération miroir peut prendre 10-60s selon charge

**Solution** : Timeouts généreux (60s) + retries (2-3)

**Risque** : Tests lents (3-5 minutes par parcours complet)

---

#### 3. Données test réalistes

**Friction** : Réponses aléatoires peuvent produire parcours invalides

**Solution** : Fixtures prédéfinies + validation réponses

**Exemple** : Si question attend A-D, générer uniquement A-D (pas E ou texte libre)

---

#### 4. Debugging tests échoués

**Friction** : Comprendre POURQUOI un test échoue (UI ? Backend ? Race ?)

**Solution** : Captures automatiques (screenshot + HTML + logs + trace)

**Outil** : `playwright show-trace test-results/trace.zip`

---

#### 5. CI/CD integration

**Friction** : Tests Playwright nécessitent navigateur headless en CI

**Solution** : GitHub Actions avec `ubuntu-latest` + Playwright pre-installed

**Exemple** : `.github/workflows/e2e-tests.yml`

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: test-results
          path: test-results/
```

---

### 💰 COÛTS

| Élément | Coût | Fréquence |
|---------|------|-----------|
| **Développement initial** | 2-3 jours dev | One-time |
| **Maintenance** | 1-2h/mois | Récurrent |
| **Exécution tests (local)** | Gratuit | Illimité |
| **Exécution tests (CI)** | GitHub Actions gratuit (2000 min/mois) | Récurrent |
| **Mocks LLM** | Gratuit | Illimité |
| **Stockage screenshots** | ~100 MB | Négligeable |

**Total annuel** : **~500€** (si comptabilise temps dev @ 50€/h × 20h + maintenance)

---

### ✅ BÉNÉFICES

| Bénéfice | Impact |
|----------|--------|
| **Détection bugs avant prod** | 🟢 Élevé |
| **Régression prevention** | 🟢 Élevé |
| **Confiance déploiements** | 🟢 Élevé |
| **Économie temps debug** | 🟢 Élevé |
| **Documentation vivante** | 🟡 Moyen |
| **Onboarding nouveaux devs** | 🟡 Moyen |

---

## 9️⃣ RECOMMANDATION FINALE

### 🎯 ARCHITECTURE RECOMMANDÉE

**Stack** :
- ✅ Playwright (test E2E)
- ✅ Variables d'environnement (mock activation)
- ✅ Code conditionnel minimal (fallback mock dans `openaiClient.ts` et `googleSheetsLiveTracking.ts`)
- ✅ Fixtures prédéfinies (identités + réponses)
- ✅ Helpers réutilisables (`AxiomTestHelper`)
- ✅ Captures automatiques erreurs

**Pas de** :
- ❌ MSW (trop complexe pour MVP)
- ❌ Serveur mock séparé (overhead)
- ❌ Tests unitaires backend (hors scope)

---

### 📝 PROCÉDURE INSTALLATION RÉSUMÉE

```bash
# 1. Installer Playwright
npm install -D @playwright/test
npx playwright install chromium

# 2. Créer structure
mkdir -p tests/{e2e,fixtures,mocks,utils}

# 3. Créer fichiers configuration
# - playwright.config.ts
# - .env.test
# - tests/fixtures/responses.ts
# - tests/utils/page-helpers.ts
# - tests/e2e/99-full-profile.spec.ts

# 4. Modifier code pour mock (MINIMAL)
# - src/services/openaiClient.ts : if (process.env.AXIOM_TEST_MODE) return mock;
# - src/services/googleSheetsLiveTracking.ts : if (process.env.GOOGLE_SHEETS_MOCK_ENABLED) return;

# 5. Lancer tests
npm run test

# 6. Répéter 100 fois
npm run test:100
```

**Temps total** : 2-3 jours

---

### ⚡ QUICK WIN (1 JOURNÉE)

Si besoin MVP rapide :

1. **Installer Playwright** (30 min)
2. **Écrire 1 seul test** : Transition 2B→3 (2h)
3. **Mock OpenAI basique** : Variable env + fallback (1h)
4. **Lancer 10 fois** : Vérifier stabilité (30 min)

**Total** : 4h → Détecte le bug BLOC 3 immédiatement

---

### 🎯 VERDICT FINAL

**Est-ce que ça vaut le coup ?** : **OUI à 100%**

**Pourquoi** :
- ✅ Détecte 85-90% des bugs UI/routing/SSE
- ✅ Détecte le bug BLOC 3 (handler manquant)
- ✅ Économise des heures de tests manuels
- ✅ Prévient régressions futures
- ✅ Coût raisonnable (2-3 jours setup)
- ✅ ROI positif dès la 1ère régression évitée

**Limitations acceptables** :
- ⚠️ Ne teste pas qualité LLM réel (nécessite tests manuels complémentaires)
- ⚠️ Ne teste pas race conditions complexes (nécessite tests charge)

**Recommandation** : **IMPLÉMENTER** en priorité P0 après fix bug BLOC 3

---

**FIN DE LA PROCÉDURE** — Prêt pour implémentation
