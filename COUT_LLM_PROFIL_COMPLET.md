# Confirmation double appel miroirs 3–9 + Coût 1 profil complet + matching

## 1) Double appel miroirs 3–9 (lecture en creux)

**Confirmé : le double appel est voulu et économise des tokens.**

- **Premier appel** (executor, prompt REVELIOM complet + historique) : pose le cadre strict « lecture en creux » (20/25 mots, format 1️⃣2️⃣3️⃣, annonce de transition) et produit une première version. C’est ce qui garantit que la *lecture en creux* est bien la règle à cette étape.
- **Deuxième chemin** (nouvelle architecture) : 3 étapes ciblées  
  - **Interprétation** (gpt-4o-mini, max 300 tokens) : structure JSON à partir des seules réponses du bloc.  
  - **Angle** (gpt-4o-mini, max 150 tokens) : une phrase « Ce n’est probablement pas X, mais Y ».  
  - **Rendu** (gpt-4o, max 200 tokens) : texte mentor final.  

En envoyant uniquement les réponses du bloc (et pas tout l’historique) aux deux appels mini, et en limitant la sortie 4o à 200 tokens, on évite un seul très gros appel 4o sur tout l’historique pour chaque miroir. La décomposition en 3 étapes + premier appel « cadre » est donc obligatoire pour la lecture en creux et, au total, **réduit** la consommation de tokens par rapport à une génération monolithique. Aucune modification à faire côté code.

---

## 2) Coût 1 profil complet + matching (estimation)

### Prix utilisés (OpenAI, ordre de grandeur courant)

| Modèle        | Input (par 1M tokens) | Output (par 1M tokens) |
|---------------|------------------------|-------------------------|
| **gpt-4o**    | 2,50 $                 | 10,00 $                 |
| **gpt-4o-mini** | 0,15 $               | 0,60 $                  |

*(Source : type OpenAI Pricing ; à vérifier sur platform.openai.com/docs/pricing si besoin.)*

### Nombre d’appels et ordre de grandeur de tokens par bloc

| Bloc | Élément | Modèle | Input (tokens) | Output (tokens) |
|------|--------|--------|----------------|-----------------|
| **1** | Miroir (structure + angle + rendu) | mini + mini + 4o | ~1,6k + ~0,4k + ~1,2k | ~0,3k + ~0,15k + ~0,2k |
| **2A** | 3 questions | 4o | ~2,8k × 3 ≈ 8,4k | ~0,1k × 3 ≈ 0,3k |
| **2B** | Génération questions (1 appel) | 4o | ~6k | ~1,5k |
| **2B** | Miroir (structure + angle + rendu) | mini + mini + 4o | ~2,4k + ~0,4k + ~1,5k | ~0,3k + ~0,15k + ~0,2k |
| **3** | Miroir (1er appel cadre + nouvelle arch.) | 4o + (mini + mini + 4o) | ~22k + ~1,4k + ~1,2k | ~0,15k + ~0,45k + ~0,2k |
| **4→9** | 6 miroirs (même schéma, historique croissant) | 4o + (mini + mini + 4o) chacun | ~30k moy. × 6 + 6×(~2,6k) | 6×(~0,15k + ~0,45k + ~0,2k) |
| **10** | Synthèse (structure + rendu, pas d’angle) | mini + 4o | ~8k + ~2k | ~0,3k + ~0,8k |
| **Matching** | (structure + rendu) | mini + 4o | ~10k + ~2,5k | ~0,3k + ~0,8k |

*(Les valeurs sont des ordres de grandeur pour un profil typique ; l’historique et la longueur des réponses font varier l’input.)*

### Somme des tokens (ordre de grandeur)

- **gpt-4o input** : ~1,2k + 8,4k + 6k + 1,5k + 23k + (6 × ~32k) + 2k + 2,5k ≈ **255k tokens**  
- **gpt-4o output** : ~0,2k + 0,3k + 1,5k + 0,2k + 0,35k + (6 × 0,35k) + 0,8k + 0,8k ≈ **6,2k tokens**  
- **gpt-4o-mini input** : ~2k + 2,4k + 1,4k + (6 × 1,4k) + 8k + 10k ≈ **32k tokens**  
- **gpt-4o-mini output** : ~0,45k + 0,45k + 0,45k + (6 × 0,45k) + 0,3k + 0,3k ≈ **4,7k tokens**

### Coût en € (1 profil complet + matching)

- Taux utilisé : **1 € ≈ 1,08 $** (à ajuster si besoin).  
- **gpt-4o** : 255k × (2,50/1e6) + 6,2k × (10/1e6) ≈ **0,64 $ + 0,06 $ ≈ 0,70 $**  
- **gpt-4o-mini** : 32k × (0,15/1e6) + 4,7k × (0,60/1e6) ≈ **0,005 $ + 0,003 $ ≈ 0,008 $**  

**Total estimé par profil (questions + miroirs + synthèse + matching) :**  
- **≈ 0,71 $** soit **≈ 0,66 €** (avec 1 € = 1,08 $).

### Résumé

| Métrique | Valeur |
|----------|--------|
| **Tokens 4o (input)** | ~255 000 |
| **Tokens 4o (output)** | ~6 200 |
| **Tokens 4o-mini (input)** | ~32 000 |
| **Tokens 4o-mini (output)** | ~4 700 |
| **Total tokens (tous modèles)** | **~298 000** |
| **Coût estimé (USD)** | **~0,71 $** |
| **Coût estimé (EUR)** | **~0,66 €** |

*(Les chiffres sont des estimations ; le coût réel dépend des longueurs d’historique, des réponses candidat et des prix à jour sur la page OpenAI.)*
