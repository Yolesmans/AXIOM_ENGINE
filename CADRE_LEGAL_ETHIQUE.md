# ⚖️ CADRE LÉGAL & ÉTHIQUE — AXIOM / REVELIOM

**Date** : 2025-01-27  
**Objectif** : Cadre minimal "safe" et applicable immédiatement  
**Conformité** : RGPD, transparence, non-discrimination, consentement

---

## 1️⃣ POSITIONNEMENT PRODUIT

### 1.1 Nature de l'outil

**Positionnement** : **Outil d'aide à la compréhension professionnelle**, pas diagnostic médical/psy.

**Wording proposé** :
> AXIOM est un outil d'aide à la compréhension de votre fonctionnement professionnel.  
> Il ne s'agit pas d'un diagnostic médical, psychologique ou psychiatrique.  
> AXIOM ne remplace pas un accompagnement professionnel personnalisé.

**Où afficher** : Footer de la page, modal au démarrage (optionnel)

---

### 1.2 Finalité

**Finalité** : Aide à la compréhension de soi et à l'orientation professionnelle.

**Wording proposé** :
> AXIOM vous aide à mieux comprendre votre fonctionnement professionnel  
> et à identifier les environnements où vous pouvez vous épanouir.

---

## 2️⃣ MINIMISATION DES DONNÉES

### 2.1 Données collectées

**Données collectées** :
- Identité : Prénom, Nom, Email (obligatoire)
- Réponses aux questions AXIOM (obligatoire)
- Préférences (séries, films, œuvres) (obligatoire)
- Validations miroirs (obligatoire)

**Données NON collectées** :
- Origine ethnique
- Religion
- Opinions politiques
- Santé
- Handicap
- Vie sexuelle
- Syndicat

**Preuve code** : `src/engine/prompts.ts:371-406` (zones interdites définies dans prompts)

---

### 2.2 Durées de conservation

**Règle proposée** :
- **Données actives** : 12 mois après dernière activité
- **Données archivées** : 24 mois maximum
- **Suppression automatique** : Après 24 mois d'inactivité

**Implémentation** :
- Ajouter `lastActivityAt` dans `AxiomCandidate` (déjà présent)
- Job de nettoyage automatique (à implémenter)

---

## 3️⃣ DROIT D'ACCÈS / SUPPRESSION

### 3.1 Droit d'accès

**Processus proposé** :
1. Candidat envoie email à `contact@elgaenergy.fr` avec demande d'accès
2. Réponse sous 30 jours avec export JSON des données
3. Format : `axiom_data_export_{candidateId}.json`

**Wording proposé** :
> Vous avez le droit d'accéder à vos données personnelles.  
> Pour exercer ce droit, contactez-nous à : contact@elgaenergy.fr

---

### 3.2 Droit de suppression

**Processus proposé** :
1. Candidat envoie email à `contact@elgaenergy.fr` avec demande de suppression
2. Suppression sous 30 jours
3. Confirmation par email

**Wording proposé** :
> Vous avez le droit de demander la suppression de vos données personnelles.  
> Pour exercer ce droit, contactez-nous à : contact@elgaenergy.fr

---

## 4️⃣ CONSENTEMENT

### 4.1 Consentement explicite

**Wording proposé** (modal au démarrage) :
> En utilisant AXIOM, vous acceptez que vos réponses soient stockées et utilisées  
> pour générer votre profil professionnel et votre matching.  
> Vos données sont traitées conformément à notre politique de confidentialité.

**Boutons** :
- "J'accepte" → Démarrer AXIOM
- "Je refuse" → Redirection vers page d'information

**Implémentation** :
- Ajouter modal au démarrage (`ui-test/app.js`)
- Stocker consentement dans `candidate.consentGivenAt` (ISO timestamp)

---

### 4.2 Tracking / Analytics

**Règle proposée** :
- Aucun tracking tiers (Google Analytics, etc.) sans consentement explicite
- Analytics internes uniquement (si nécessaire)

**Wording proposé** :
> Nous n'utilisons pas de cookies de tracking tiers.  
> Vos données sont utilisées uniquement pour générer votre profil AXIOM.

---

## 5️⃣ NON-DISCRIMINATION

### 5.1 Garde-fous techniques

**Règles** :
- Aucune décision automatique basée sur origine, religion, opinions politiques, santé, handicap
- Prompts explicitement interdits (`src/engine/prompts.ts:371-406`)

**Preuve code** : Les prompts contiennent des interdictions explicites

---

### 5.2 Transparence algorithmique

**Wording proposé** :
> AXIOM analyse votre fonctionnement professionnel basé sur vos réponses.  
> Le matching évalue la compatibilité avec le poste selon des critères objectifs  
> (capacité à soutenir un effort autonome, rapport à la vente, etc.).  
> Aucune décision n'est basée sur des critères discriminatoires.

---

## 6️⃣ TRANSPARENCE

### 6.1 Limites de l'outil

**Wording proposé** :
> AXIOM est un outil d'aide à la compréhension.  
> Il ne garantit pas :  
> - une compatibilité parfaite avec un poste  
> - une réussite professionnelle  
> - une analyse exhaustive de votre profil  
>  
> Le matching est une indication, pas une décision définitive.

---

### 6.2 Finalité + usage

**Wording proposé** :
> Vos données sont utilisées uniquement pour :  
> - générer votre profil professionnel AXIOM  
> - évaluer votre compatibilité avec le poste de courtier en énergie  
> - améliorer l'outil AXIOM (de manière anonyme)  
>  
> Vos données ne sont pas vendues, partagées ou utilisées à d'autres fins.

---

### 6.3 Risques (hallucinations, biais, sur-interprétation)

**Wording proposé** :
> AXIOM utilise une intelligence artificielle pour analyser vos réponses.  
> Comme tout outil IA, AXIOM peut :  
> - produire des interprétations imprécises  
> - être influencé par des biais  
> - sur-interpréter certaines réponses  
>  
> Nous recommandons de prendre les résultats comme des indications,  
> pas comme des vérités absolues.

**Mitigation** :
- Validation miroirs obligatoire (candidat peut nuancer)
- Profil final basé uniquement sur réponses réelles (pas d'inférence)
- Matching avec critères objectifs (pas de projection abstraite)

---

## 7️⃣ WORDING PRÊT À POSER

### 7.1 Footer (toutes les pages)

```
AXIOM — Outil d'aide à la compréhension professionnelle

Données personnelles :
- Accès : contact@elgaenergy.fr
- Suppression : contact@elgaenergy.fr
- Conservation : 12 mois actifs, 24 mois maximum

AXIOM n'est pas un diagnostic médical ou psychologique.
```

---

### 7.2 Modal consentement (au démarrage)

```
AVANT DE COMMENCER

En utilisant AXIOM, vous acceptez que vos réponses soient stockées et utilisées
pour générer votre profil professionnel et votre matching.

Vos données sont traitées conformément à notre politique de confidentialité.

[ J'accepte ]  [ En savoir plus ]
```

---

### 7.3 Page "En savoir plus" (lien modal)

```
POLITIQUE DE CONFIDENTIALITÉ — AXIOM

1. Données collectées
- Identité : Prénom, Nom, Email
- Réponses aux questions AXIOM
- Préférences (séries, films, œuvres)
- Validations miroirs

2. Finalité
Vos données sont utilisées uniquement pour :
- générer votre profil professionnel AXIOM
- évaluer votre compatibilité avec le poste
- améliorer l'outil AXIOM (de manière anonyme)

3. Conservation
- Données actives : 12 mois après dernière activité
- Données archivées : 24 mois maximum
- Suppression automatique après 24 mois d'inactivité

4. Vos droits
- Droit d'accès : contact@elgaenergy.fr
- Droit de suppression : contact@elgaenergy.fr
- Réponse sous 30 jours

5. Limites
AXIOM est un outil d'aide à la compréhension.
Il ne garantit pas une compatibilité parfaite ou une réussite professionnelle.
Le matching est une indication, pas une décision définitive.

6. Risques
AXIOM utilise une intelligence artificielle.
Comme tout outil IA, AXIOM peut produire des interprétations imprécises
ou être influencé par des biais.
Nous recommandons de prendre les résultats comme des indications.

7. Non-discrimination
Aucune décision n'est basée sur des critères discriminatoires
(origine, religion, opinions politiques, santé, handicap).
```

---

## 8️⃣ CHECKLIST CONFORMITÉ

### ✅ Conditions techniques

- [ ] Consentement stocké (`candidate.consentGivenAt`)
- [ ] Modal consentement affichée au démarrage
- [ ] Footer présent sur toutes les pages
- [ ] Page "En savoir plus" accessible
- [ ] Processus d'accès aux données documenté
- [ ] Processus de suppression documenté
- [ ] Job de nettoyage automatique (à implémenter)

### ✅ Conditions légales

- [ ] Wording conforme RGPD
- [ ] Finalité clairement expliquée
- [ ] Durées de conservation définies
- [ ] Droits d'accès/suppression documentés
- [ ] Limites de l'outil explicitées
- [ ] Risques mentionnés
- [ ] Non-discrimination garantie

### ✅ Conditions éthiques

- [ ] Positionnement clair (outil d'aide, pas diagnostic)
- [ ] Transparence algorithmique
- [ ] Minimisation des données
- [ ] Zones interdites respectées (prompts)

---

## 9️⃣ IMPLÉMENTATION TECHNIQUE

### 9.1 Stockage consentement

**Fichier** : `src/types/candidate.ts`

**Modification** :
```typescript
export interface AxiomCandidate {
  // ... existant
  consentGivenAt?: string; // ISO timestamp
  consentVersion?: string; // Version du wording (pour traçabilité)
}
```

**Fichier** : `src/store/sessionStore.ts`

**Modification** : Ajouter méthode `recordConsent()`

**Code attendu** :
```typescript
recordConsent(candidateId: string, version: string = '1.0'): void {
  const candidate = this.candidates.get(candidateId);
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }

  const updated: AxiomCandidate = {
    ...candidate,
    consentGivenAt: new Date().toISOString(),
    consentVersion: version,
  };

  this.candidates.set(candidateId, updated);
  this.persistCandidate(candidateId);
}
```

---

### 9.2 Modal consentement frontend

**Fichier** : `ui-test/app.js`

**Modification** : Ajouter modal au démarrage

**Code attendu** :
```typescript
function showConsentModal(): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.id = 'consent-modal';
    modal.className = 'consent-modal';
    modal.innerHTML = `
      <div class="consent-modal-content">
        <h2>AVANT DE COMMENCER</h2>
        <p>En utilisant AXIOM, vous acceptez que vos réponses soient stockées et utilisées
        pour générer votre profil professionnel et votre matching.</p>
        <p>Vos données sont traitées conformément à notre politique de confidentialité.</p>
        <div class="consent-buttons">
          <button id="consent-accept">J'accepte</button>
          <button id="consent-more">En savoir plus</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('consent-accept')?.addEventListener('click', () => {
      // Enregistrer consentement
      fetch(`${API_BASE_URL}/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId,
          version: '1.0',
        }),
      });
      modal.remove();
      resolve(true);
    });

    document.getElementById('consent-more')?.addEventListener('click', () => {
      // Afficher page "En savoir plus"
      window.open('/privacy', '_blank');
    });
  });
}
```

---

### 9.3 Route consentement backend

**Fichier** : `src/server.ts`

**Modification** : Ajouter route `POST /consent`

**Code attendu** :
```typescript
app.post("/consent", async (req: Request, res: Response) => {
  try {
    const { sessionId, version } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "MISSING_SESSION_ID" });
    }

    candidateStore.recordConsent(sessionId, version || '1.0');

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[consent] error:', error);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
```

---

## 🔟 RÉCAPITULATIF

### Wording prêt à poser

1. **Footer** : Présent sur toutes les pages
2. **Modal consentement** : Au démarrage
3. **Page "En savoir plus"** : Accessible depuis modal

### Implémentation technique

1. **Stockage consentement** : `consentGivenAt`, `consentVersion`
2. **Modal frontend** : Affichage au démarrage
3. **Route backend** : `POST /consent`

### Checklist conformité

- ✅ Wording conforme RGPD
- ✅ Finalité claire
- ✅ Droits d'accès/suppression
- ✅ Limites explicitées
- ✅ Risques mentionnés
- ✅ Non-discrimination garantie

---

**FIN DU CADRE LÉGAL & ÉTHIQUE**
