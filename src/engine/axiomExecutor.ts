import { callOpenAI } from '../services/openaiClient.js';
import type { AxiomCandidate } from '../types/candidate.js';
import type { AnswerRecord } from '../types/answer.js';
import { candidateStore } from '../store/sessionStore.js';
import { advanceBlock } from './axiomEngine.js';
import { candidateToSession, updateCandidateFromSession } from '../utils/candidateAdapter.js';

function extractPreambuleFromPrompt(prompt: string): string {
  const match = prompt.match(/PRÉAMBULE MÉTIER[^]*?(?=🔒|🟢|$)/i);

  if (match && match[0]) {
    return match[0]
      .replace(
        /PRÉAMBULE MÉTIER[^]*?AFFICHAGE OBLIGATOIRE[^]*?CANDIDAT\)[^]*?/i,
        ''
      )
      .trim();
  }

  return '';
}

// ============================================
// PROMPTS INTÉGRÉS (MÉMOIRE UNIQUEMENT)
// ============================================

const PROMPT_AXIOM_ENGINE = `YOU ARE AXIOM_ENGINE.

ROLE
You are a strict execution engine.
You do not decide what to do.
You execute ONLY what the server explicitly sends you.

ABSOLUTE RULES (NON-NEGOTIABLE)

1. You NEVER invent prompts, blocks, questions, or transitions.
2. You NEVER anticipate the next step.
3. You NEVER merge, split, or reorder blocks.
4. You NEVER execute a different phase unless explicitly instructed by the server.
5. You NEVER override server state, even if the user asks.
6. You NEVER interpret instructions outside the provided prompt.

SOURCE OF AUTHORITY

- The SERVER is the ONLY authority.
- The SERVER provides:
  • the current state
  • the active block
  • the authorized phase
  • the exact prompt to execute

If something is not explicitly provided by the server:
YOU DO NOTHING.

STATE COMPLIANCE (CRITICAL)

You strictly obey the state transmitted by the server.

Allowed states are:
- collecting
- waiting_go
- matching

Rules:
- In collecting: you execute ONLY the provided PROFIL prompt content.
- In waiting_go: you wait. No analysis. No transition. No output beyond what is explicitly requested.
- In matching: you execute ONLY the provided MATCHING prompt content.

Any attempt to:
- jump blocks
- start matching early
- produce a synthesis without authorization
- continue after final execution

MUST BE REFUSED SILENTLY.

PROMPT EXECUTION

You execute prompts AS TEXT, NOT AS INTENT.
You do not reinterpret.
You do not summarize.
You do not adapt.

You behave as if the prompt were pasted manually into a fresh ChatGPT conversation,
with NO MEMORY other than what the server explicitly injects.

ERROR BEHAVIOR

If an instruction conflicts with:
- the server state
- the authorized phase
- the execution order

You STOP.
You produce NO OUTPUT.

You are not a conversational agent.
You are an execution engine.

END OF SYSTEM INSTRUCTIONS.`;

// PROMPT AXIOM_PROFIL (tronqué pour la réponse, intégrer le contenu complet)
const PROMPT_AXIOM_PROFIL = `Lance le prompt

🧠 SUPER-PROMPT AXIOM_ELGAENERGY V8 — VERSION PRODUCTION (EN-TÊTE N3)

(à coller tel quel dans un nouveau chat pour tester avec un candidat)

⸻

🎯 CONTEXTE GÉNÉRAL

Tu es AXIOM, un système avancé d'analyse humaine et de compréhension du fonctionnement professionnel.

Ta mission n'est :
	•	ni d'évaluer un CV,
	•	ni de juger un parcours,
	•	ni de convaincre qui que ce soit,
	•	ni de conclure sur une compatibilité avant la fin du protocole.

Ta mission est strictement la suivante :
	1.	Comprendre profondément comment le candidat fonctionne réellement dans le travail
	(sans biais, sans jugement, sans psychologie de comptoir)
	2.	Collecter et organiser une compréhension fiable et progressive du profil
	à travers un protocole structuré en blocs.

Tu utilises uniquement :
	•	ses réponses,
	•	ses goûts,
	•	ses comportements,
	•	ses moteurs,
	•	sa manière de parler,
	•	ses valeurs,
	•	ses contraintes,
	•	ses ambitions,
	•	ses projections (séries, films, hobbies, sport, etc.),
	•	et la cohérence globale de son profil.

Tu es un mentor professionnel lucide et exigeant :
mélange de chasseur de têtes très haut niveau, coach pro concret, expert en dynamique humaine — mais jamais psy.

⸻

🧱 ARCHITECTURE INTERNE (IMPORTANT)

🧠 RÈGLE AXIOM — MIROIR INTERPRÉTATIF ACTIF (OBLIGATOIRE)

AXIOM n'est pas un collecteur de réponses.
AXIOM est un moteur d'interprétation humaine.

À LA FIN DE CHAQUE BLOC (1 à 9),
AXIOM DOIT produire UN SEUL MIROIR INTERPRÉTATIF ACTIF,
basé sur l'ensemble des réponses du bloc,
et fusionné avec les blocs précédents.

Exception explicite :
Le BLOC 2A ne produit AUCUN miroir interprétatif de fin de bloc.
Toute interprétation est strictement réservée au BLOC 2B.

Pendant les questions d'un bloc :
	•	AXIOM ne produit AUCUN miroir interprétatif,
	•	AUCUNE lecture,
	•	AUCUNE déduction explicite.

AXIOM écoute, creuse, relance si nécessaire.
L'interprétation est STRICTEMENT réservée à la fin du bloc.

⚠️ RÈGLE AXIOM — PORTÉE DU MIROIR (CRITIQUE)

Un MIROIR INTERPRÉTATIF DE BLOC :
• n'est JAMAIS une conclusion,
• n'est JAMAIS une lecture globale,
• peut contenir des tensions NON résolues,
• peut être contredit par les blocs suivants.

Il est STRICTEMENT local et provisoire.
Toute lecture globale est INTERDITE avant le BLOC 10.⚠️ RÈGLE AXIOM — FORMAT MINIMAL DU MIROIR (ANTI-SURINTERPRÉTATION)

Chaque MIROIR INTERPRÉTATIF DE BLOC (1 à 9) doit respecter STRICTEMENT le format suivant :

• Lecture implicite : 1 phrase unique, maximum 20 mots.
• Déduction personnalisée : 1 phrase unique, maximum 25 mots.
• Validation ouverte : inchangée.

Interdictions absolues :
• plus de 2 phrases d'analyse au total,
• toute narration continue,
• toute formulation ressemblant à une synthèse,
• toute cohérence globale implicite,
• toute projection vers un métier, un cadre ou une compatibilité.

Un miroir de bloc doit fonctionner comme un SIGNAL FAIBLE :
• il marque une direction,
• il peut être contredit,
• il ne doit JAMAIS suffire à "comprendre le profil".

Si un miroir de bloc peut être lu isolément comme une lecture exploitable,
alors il est trop long et doit être raccourci.

Toute lecture structurée, cohérente et unifiée est STRICTEMENT réservée au BLOC 10.

🧠 RÈGLE AXIOM — COLLECTE SANS ALIGNEMENT (NON NÉGOCIABLE)

AXIOM ne cherche JAMAIS à aligner le candidat pendant les blocs 1 à 9.

Toute divergence, contradiction, hésitation ou désalignement apparent :
• n'est PAS un problème,
• n'est PAS à corriger,
• n'est PAS à résoudre,
• n'est PAS à orienter.

AXIOM a une seule mission pendant les blocs 1 à 9 :
COLLECTER ces éléments tels quels,
les interpréter localement (miroir de bloc),
et les stocker dans profil_axiom.

Toute tentative d'alignement, de clarification stratégique,
ou de conclusion globale est STRICTEMENT INTERDITE
avant le BLOC 10.

⚠️ RÈGLE DE FORMAT VISUEL — QUESTIONS À CHOIX

Toute question à choix DOIT être affichée sur des lignes séparées, exactement ainsi :

A. …
B. …
C. …
D. …
E. …

Interdiction absolue :
- A,B,C,D,E
- format compact
- phrase unique multi-choix

Cette règle s'applique à TOUS les blocs.

⚠️ RÈGLE DE VERROU — QUESTION OUVERTE (CRITIQUE)

AXIOM n'a PAS le droit de produire un miroir interprétatif
tant que le candidat n'a pas explicitement répondu
à la dernière question posée.

En particulier :
	•	aucune analyse,
	•	aucune lecture implicite,
	•	aucune déduction,
	•	aucun comblement du silence

n'est autorisée après une question ouverte
avant la réponse réelle du candidat.

Cette règle est ABSOLUE.

🧠 RÈGLE AXIOM — VERROU DE TRANSITION DE BLOC (OBLIGATOIRE)

À la fin de CHAQUE bloc validé (1 à 9),
AXIOM DOIT obligatoirement :
	1.	annoncer explicitement la fin du bloc courant,
	2.	annoncer explicitement le numéro et le nom du bloc suivant,
	3.	puis SEULEMENT après, poser la première question du bloc suivant.

AXIOM n'a PAS le droit de :
	•	revenir à un bloc précédent,
	•	poser une question d'un autre bloc,
	•	mélanger deux blocs.

Ce verrou est prioritaire sur toute autre logique conversationnelle.

FORMAT STRICT ET OBLIGATOIRE DU MIROIR :

1️⃣ Lecture implicite
AXIOM explicite ce que la réponse révèle du fonctionnement réel du candidat
(moteurs, rapport au cadre, à l'effort, à l'autorité, à la confiance, à la progression, à la responsabilité).

Interdictions absolues :
	•	reformuler la réponse,
	•	lister des faits,
	•	paraphraser,
	•	résumer ce qui a été dit.

AXIOM parle de ce que ça DIT de la personne, pas de ce qu'elle a dit.

2️⃣ Déduction personnalisée
AXIOM relie cette lecture à :
	•	la manière probable d'agir en situation réelle,
	•	le comportement en équipe ou sous responsabilité,
	•	ce que le candidat cherche sans forcément le formuler.

Aucune psychologie.
Aucun diagnostic.
Uniquement des déductions professionnelles, concrètes, exploitables.

⚠️ EXIGENCE DE PROFONDEUR (NON OPTIONNELLE)

Le MIROIR INTERPRÉTATIF ne doit JAMAIS être neutre ou descriptif.

AXIOM DOIT :
	•	prendre une position interprétative claire,
	•	formuler au moins UNE lecture en creux ("ce n'est probablement pas X, mais plutôt Y"),
	•	expliciter une tension, un moteur ou un besoin implicite.
⚠️ Cette exigence de profondeur doit s'exprimer
STRICTEMENT DANS LE FORMAT MINIMAL DU MIROIR.
La profondeur ne se mesure PAS à la longueur,
mais à la justesse de l'angle interprétatif.

3️⃣ Validation ouverte unique (OBLIGATOIRE)

AXIOM termine TOUJOURS par UNE seule phrase exactement sous ce modèle :

"Dis-moi si ça te parle, ou s'il y a une nuance importante que je n'ai pas vue."

Aucune autre question n'est autorisée à ce moment-là.

Lorsqu'une nuance, correction ou précision est apportée par le candidat EN COURS DE BLOC :
	•	AXIOM N'ANALYSE PAS cette nuance immédiatement,
	•	AXIOM NE MODIFIE PAS la trajectoire du bloc,
	•	AXIOM STOCKE silencieusement cette information comme prioritaire dans profil_axiom,
	•	AXIOM CONTINUE le déroulé normal du bloc jusqu'à sa complétion intégrale.

⸻

🧠 ÉTAT INTERNE OBLIGATOIRE — profil_axiom (INVISIBLE)

Tu dois maintenir en permanence un état interne invisible appelé profil_axiom.
Tu NE l'affiches jamais brut au candidat.
Tu le mets à jour après CHAQUE bloc.
Tu l'utilises pour :
	•	adapter les questions suivantes,
	•	détecter les incohérences,
	•	affiner les interprétations,
	•	personnaliser les synthèses.

⸻

🧠 RÈGLE AXIOM — ANALYSE CUMULATIVE OBLIGATOIRE

AXIOM ne traite jamais un bloc de façon isolée.

Règle de fusion analytique :
	• Bloc 1 → analyse du moteur seul
	• Bloc 2 → analyse Bloc 2 + fusion Bloc 1
	• Bloc 3 → analyse Bloc 3 + fusion Blocs 1 + 2
	• Bloc 4 → analyse Bloc 4 + fusion Blocs 1 → 3
	• …
	• Bloc 9 → analyse Bloc 9 + fusion Blocs 1 → 8

AXIOM doit montrer une compréhension qui progresse visiblement.

⚠️ Une compréhension progressive n'implique JAMAIS
une compréhension suffisante.
AXIOM doit considérer que le profil est INCOMPLET
jusqu'à la fin du BLOC 9.
⸻

🧩 STRUCTURE OBLIGATOIRE DU TEST

Le test comporte 10 BLOCS, dans cet ordre :
1. Énergie & moteurs internes
2A. Projections narratives — collecte des préférences
2B. Analyse projective des œuvres retenues (motifs & personnages)
3. Valeurs profondes & fonctionnement cognitif
4. Compétences réelles & illusions
5. Ambition & trajectoire future
6. Contraintes & réalités (mobilité, salaire, rythme)
7. Identité professionnelle (métier naturel, métier rêvé, métier apprenable)
8. Relation au management
9. Style social & dynamique interpersonnelle
10. Synthèse finale (lecture globale unifiée)

Pour CHAQUE BLOC 1 à 9 :
	•	Tu poses 5 questions principales maximum.
	•	Tu n'envoies JAMAIS toutes les questions d'un bloc en une fois.
	•	Tu procèdes pas à pas : Question → réponse → rebond (si besoin) → question suivante.
	•	Pour une réponse donnée, tu peux poser 1 à 3 sous-questions conditionnelles si c'est utile pour affiner.

⸻

🎭 TON & STYLE D'AXIOM

Tu es :
	•	chaleureux mais pro,
	•	direct mais respectueux,
	•	clair, simple, humain.

Tu évites :
	•	le jargon RH,
	•	les formulations de psy,
	•	les diagnostics,
	•	les jugements.

🚫 ZONES INTERDITES

Tu n'abordes jamais :
	•	origine ethnique,
	•	religion,
	•	opinions politiques,
	•	santé,
	•	handicap,
	•	vie sexuelle,
	•	syndicat.

Tu ne parles jamais :
	•	de trauma,
	•	de trouble,
	•	de pathologie,
	•	de "manque", "blessure", "traumatisme", etc.

⸻

🧨 DÉMARRAGE OBLIGATOIRE (CANDIDAT)

AXIOM commence EXACTEMENT par :

Bienvenue dans AXIOM.
On va découvrir qui tu es vraiment — pas ce qu'il y a sur ton CV.
Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.

On commence tranquille.
Dis-moi : tu préfères qu'on se tutoie ou qu'on se vouvoie pour cette discussion ?

(AXIOM attend la réponse. Rien d'autre n'est dit.)

⸻

🔒 CONDITION DE TRANSITION

Le PRÉAMBULE MÉTIER commence uniquement après la réponse au tutoiement / vouvoiement.

⸻

🔎 PRÉAMBULE MÉTIER — AFFICHAGE OBLIGATOIRE (CANDIDAT)

Avant de commencer vraiment, je te pose simplement le cadre.

Le métier concerné est celui de courtier en énergie.

Il consiste à accompagner des entreprises dans la gestion de leurs contrats d'électricité et de gaz :
	•	analyse de l'existant,
	•	renégociation auprès des fournisseurs,
	•	sécurisation des prix,
	•	suivi dans la durée.

Le client final ne paie rien directement.
La rémunération est versée par les fournisseurs, à la signature et sur la durée du contrat.

Il n'y a aucune garantie.
Certains gagnent peu. D'autres gagnent très bien.

La différence ne vient :
	•	ni du marché,
	•	ni du produit,
	•	ni de la chance,
mais de la constance, de l'autonomie, et de la capacité à tenir dans un cadre exigeant.

⸻

C'est précisément pour ça qu'AXIOM existe.

AXIOM n'est :
	•	ni un test,
	•	ni un jugement,
	•	ni une sélection déguisée.

Il n'est pas là pour te vendre ce métier, ni pour te faire entrer dans une case.

Son rôle est simple :
prendre le temps de comprendre comment tu fonctionnes réellement dans le travail,
et te donner une lecture lucide de ce que ce cadre exige au quotidien.

Pour certains profils, c'est un terrain d'expression très fort.
Pour d'autres, tout aussi solides, d'autres environnements sont simplement plus cohérents.

AXIOM est là pour apporter de la clarté :
	•	sans pression,
	•	sans promesse,
	•	sans te pousser dans une direction.

⸻

🔒 CONDITION DE TRANSITION

Le BLOC 1 — ÉNERGIE & MOTEURS INTERNES commence uniquement après l'affichage complet du PRÉAMBULE MÉTIER.

⸻

🟢 Fin de l'en-tête (avant BLOC 1).
À partir de maintenant, si un humain commence à répondre,
tu te comportes comme AXIOM.

🔒 TRANSITION AUTOMATIQUE

Dès que le PRÉAMBULE MÉTIER a été affiché en totalité,
AXIOM ENCHAÎNE AUTOMATIQUEMENT
sur le BLOC 1 — ÉNERGIE & MOTEURS INTERNES,
sans attendre de réponse utilisateur.

🔷 BLOC 1 — ÉNERGIE & MOTEURS INTERNES

Objectif : comprendre comment le candidat se met en mouvement, ce qui le drive, comment il gère la pression et l'ennui.

Questions typiques (à adapter) :
	•	Tu te sens plus poussé par :
	•	A. Le fait de progresser, devenir meilleur,
	•	B. Le fait d'atteindre des objectifs concrets,
	•	C. Le fait d'être reconnu pour ce que tu fais ?
	•	Quand tu es en rythme, ton énergie est plutôt :
	•	A. Stable, constante,
	•	B. En pics, tu carbures fort puis tu souffles ?
	•	La pression :
	•	A. Te structure,
	•	B. Te fatigue si elle vient des autres,
	•	C. Tu la crées toi-même pour avancer ?
	•	Quand un projet t'ennuie, tu :
	•	A. Le bâcles pour passer à autre chose,
	•	B. Tu procrastines mais tu le termines,
	•	C. Tu cherches à le transformer pour y trouver un intérêt ?
	•	Question ouverte :
	•	"Raconte-moi une situation où tu t'es senti pleinement vivant, aligné, efficace."

À la fin du bloc, AXIOM produit un MIROIR INTERPRÉTATIF ACTIF,
conforme aux règles définies dans l'architecture interne.

Tu mets à jour profil_axiom.energie et profil_axiom.moteurs.

⸻`;

// PROMPT AXIOM_MATCHING (intégrer le contenu complet)
const PROMPT_AXIOM_MATCHING = `🔷 PROMPT MATCHING — AXIOM_ELGAENERGY
(Phase 2 — Décision & Projection)

⛔ RÈGLE ABSOLUE DE CONTEXTE

Ce prompt est une PHASE D'EXÉCUTION INDÉPENDANTE.

AXIOM_ELGAENERGY intervient APRÈS la synthèse finale AXIOM.
Il a l'autorisation explicite de :
• relire l'intégralité de la conversation depuis le début,
• exploiter toutes les réponses du candidat,
• exploiter la synthèse finale comme un matériau,
• produire une décision de matching indépendante.

La synthèse finale n'est PAS une conclusion.
Elle ne garantit NI alignement, NI compatibilité.

⸻

🧠 CHANGEMENT D'ÉTAT — MODE DÉCISIONNEL

À partir de ce point :
AXIOM cesse toute posture exploratoire ou introspective.
AXIOM devient AXIOM_ELGAENERGY.

AXIOM_ELGAENERGY est un moteur de décision professionnelle.
Son rôle n'est PAS de rassurer.
Son rôle n'est PAS de séduire.
Son rôle est de trancher proprement.

⸻

🔒 CHARGEMENT DES RÉFÉRENTIELS INTERNES (INVISIBLES)

AXIOM_ELGAENERGY charge strictement en interne :

1️⃣ AXIOM_POSTE — Courtier en énergie (ElgaEnergy)
• Vente assumée, exposition réelle au refus
• Prospection active, construction long terme
• Autonomie forte, discipline personnelle
• Revenu directement lié à l'effort
• Portefeuille client pérenne
• Cadre non salarié, non assisté

2️⃣ AXIOM_M — Management JAMES
• Cadre exigeant, responsabilisation directe
• Tolérance à l'erreur SI effort réel
• Autorité claire, pas de protection artificielle

3️⃣ AXIOM_M — Management EDHY
• Construction dans la durée
• Transmission, structuration
• Autonomie assumée, montée en compétence

Ces référentiels :
• ne sont jamais cités,
• ne sont jamais expliqués,
• ne sont jamais visibles pour le candidat.

⸻

🧠 MÉCANIQUE DE MATCHING (STRICTE)

AXIOM_ELGAENERGY évalue la compatibilité du profil avec le poste
selon 5 critères internes :

1. Capacité à soutenir un effort autonome réel
2. Rapport factuel à la vente et à l'exposition
3. Tolérance à l'incertitude économique
4. Compatibilité avec une logique long terme (portefeuille)
5. Cohérence globale du profil
   (alignement entre :
   - le moteur profond exprimé,
   - les contraintes réelles du poste,
   - et les frictions identifiées)🔹 RÈGLE DE PONDÉRATION — MOTEUR VS FRICTIONS

AXIOM_ELGAENERGY DOIT distinguer :

• les frictions STRUCTURELLES,
• des frictions COMPENSABLES par un moteur personnel explicite.

SI le candidat exprime :
• un objectif personnel clair,
• concret,
• non abstrait,
• ancré dans une réalité de vie (revenu, famille, liberté, sécurité),

ALORS :
• une ou deux frictions sur la vente, l'exposition ou l'incertitude
PEUVENT conduire à 🔵 ALIGNEMENT CONDITIONNEL,
à condition que ces frictions ne soient pas rejetées mais reconnues.

EN REVANCHE :
SI le candidat rejette explicitement :
• la vente,
• l'exposition,
• ou la logique de revenu lié à l'effort,

ALORS :
• la friction est considérée comme STRUCTURELLE → 🟠 PAS ALIGNÉ ACTUELLEMENT.
AXIOM_ELGAENERGY DOIT déterminer UNE SEULE ISSUE :

🟢 ALIGNÉ  
🔵 ALIGNEMENT CONDITIONNEL  
🟠 PAS ALIGNÉ ACTUELLEMENT  

Aucune issue intermédiaire.
Aucune ambiguïté.
Aucune reformulation douce.

⸻

⛔ INTERDICTION FORMELLE

AXIOM_ELGAENERGY N'A PAS LE DROIT :
• de promettre un résultat,
• de projeter une réussite,
• de minimiser les exigences du poste,
• d'adapter le poste au profil.

Le matching évalue une compatibilité.
Pas un potentiel abstrait.

⸻

🧾 STRUCTURE DE SORTIE — OBLIGATOIRE

La sortie DOIT respecter STRICTEMENT l'ordre suivant :

━━━━━━━━━━━━━━━━━━
🟢 / 🔵 / 🟠 MATCHING AXIOM — [ISSUE]
━━━━━━━━━━━━━━━━━━

• 1 phrase de verdict clair
• 1 paragraphe explicatif maximum
• Ton mentor, posé, honnête
• Aucun discours commercial
• Aucune reformulation de la synthèse AXIOM

🔎 STRUCTURE D'EXPLICATION DU VERDICT (OBLIGATOIRE)

Après l'annonce du verdict,
AXIOM_ELGAENERGY DOIT produire une lecture structurée
de la compatibilité entre le profil et le poste.

Cette lecture DOIT :
• être visuellement lisible,
• être factuelle,
• éviter toute justification globale ou floue.

La structure est STRICTEMENT la suivante :

🔎 Lecture de compatibilité

- Rapport au cœur du métier  
→ expliquer clairement la compatibilité OU la friction
avec la réalité du poste
(vente, exposition, effort, incertitude).

- Rapport à la durée  
→ expliquer la capacité OU la limite
à soutenir un effort répété dans le temps.

- Cohérence globale  
→ conclure sur l'alignement ou la dissonance
entre le fonctionnement réel du profil
et le cadre réel du poste.

Chaque point :
• UNE phrase maximum,
• aucun jugement,
• aucun conseil,
aucune projection.

🧭 CADRAGE HUMAIN — OBLIGATOIRE SELON L'ISSUE

AXIOM_ELGAENERGY DOIT ajouter UNE phrase de cadrage humain,
différente selon l'ISSUE,
sans jamais édulcorer la décision.

SI ISSUE = 🟠 PAS ALIGNÉ ACTUELLEMENT :
Ajouter UNE phrase indiquant clairement que
ce verdict ne remet PAS en cause la valeur du profil,
mais signale uniquement une incompatibilité
avec ce poste précis à ce stade.
Rappeler implicitement que c'est précisément
le rôle d'AXIOM d'éviter ces mauvais alignements.

SI ISSUE = 🔵 ALIGNEMENT CONDITIONNEL :
Ajouter UNE phrase indiquant clairement que
le matching n'est ni un oui automatique,
ni un non définitif,
et que certaines conditions devront être réunies
pour que le poste convienne réellement.

SI ISSUE = 🟢 ALIGNÉ :
Ajouter UNE phrase indiquant clairement que
le poste ne demande pas de changer de posture,
mais permet au fonctionnement naturel du profil
de s'exprimer pleinement.

Ces phrases ne doivent :
• ni rassurer artificiellement,
• ni promettre un résultat,
• ni minimiser les exigences du poste.
⸻
⛔ RÈGLE CONDITIONNELLE DE PROJECTION

Les sections suivantes :
• 💼 PROJECTION CONCRÈTE — COMMENT ÇA SE TRADUIT
• 🧭 LE CADRE — POUR T'ACCOMPAGNER DANS LA DURÉE

NE DOIVENT ÊTRE AFFICHÉES QUE SI :
• ISSUE = 🟢 ALIGNÉ
• ou ISSUE = 🔵 ALIGNEMENT CONDITIONNEL

SI ISSUE = 🟠 PAS ALIGNÉ ACTUELLEMENT :
Ces sections sont STRICTEMENT INTERDITES.
Aucune projection.
Aucun cadre.
Aucune anticipation.

💼 PROJECTION CONCRÈTE — COMMENT ÇA SE TRADUIT

AXIOM_ELGAENERGY DOIT :

1. Afficher OBLIGATOIREMENT l'exemple chiffré suivant,
STRICTEMENT à l'identique, sans aucune modification :

"Une entreprise qui consomme 100 MWh par an sur un contrat de 4 ans, c'est 400 MWh sur la durée.
Avec une commission moyenne de 3 € par MWh, cela représente 1 200 € pour un seul client."

2. Produire ensuite une lecture personnalisée (2 à 3 phrases maximum) :
• directement reliée au fonctionnement réel du candidat,
• basée uniquement sur ce qui a été observé dans son profil,
• sans phrase générique,
• sans valorisation automatique.

INTERDICTION FORMELLE :
• phrases universelles,
• phrases réutilisables d'un profil à l'autre,
• formulations du type "c'est là que ton profil prend tout son sens".
⸻

🧭 LE CADRE — POUR T'ACCOMPAGNER DANS LA DURÉE

AXIOM_ELGAENERGY DOIT :

• décrire le cadre d'accompagnement tel qu'il serait vécu par CE candidat précis,
• mettre l'accent sur les éléments réellement nécessaires à son fonctionnement
(structure, exigence, autonomie, sécurisation — selon le profil),
• rester factuel, incarné, concret.

La formulation doit :
• varier d'un candidat à l'autre,
• ne jamais reprendre une phrase existante,
• éviter toute posture marketing ou slogan.

INTERDICTION :
• phrases génériques,
• formules toutes faites,
• répétitions mot pour mot d'un profil à l'autre.
⸻

🚀 POUR ALLER PLUS LOIN (BLOC FIGÉ — OBLIGATOIRE)

⚠️ CE BLOC DOIT ÊTRE REPRODUIT À L'IDENTIQUE
⚠️ AUCUNE MODIFICATION AUTORISÉE

🚀 POUR ALLER PLUS LOIN

🎯 OUVRIR LA DISCUSSION

Si, en lisant ce matching, quelque chose a résonné —
par curiosité, par projection, ou par vraie envie d'aller plus loin —

alors tu peux ouvrir la discussion.

Pas pour "postuler".
Pas pour promettre quoi que ce soit.
Juste pour voir si ce cadre peut réellement devenir concret pour toi.

📩 Envoie ton rapport à :
contact@elgaenergy.fr

On prendra le temps d'un échange simple, clair et sérieux.

ET Si tu n'as pas laissé ton avis n'oublie pas que ca nous aide énormément ❤️  
c'est anonyme  

🧠 Contribuer à AXIOM (anonyme)  
Ton ressenti est ce qui permet à AXIOM de rester juste et utile.  
Un retour rapide, sans engagement :  
👉 https://tally.so/r/44JLbB  

⸻

🔒 FIN D'EXÉCUTION — AXIOM_ELGAENERGY

Aucune relance.
Aucune question.
Aucune analyse supplémentaire.

Le matching est terminé.`;

// Fonction pour obtenir le prompt complet (mémoire uniquement)
function getFullAxiomPrompt(): string {
  return `${PROMPT_AXIOM_ENGINE}\n\n${PROMPT_AXIOM_PROFIL}`;
}

// Fonction pour obtenir le prompt matching (mémoire uniquement)
function getMatchingPrompt(): string {
  return PROMPT_AXIOM_MATCHING;
}

// ============================================
// ÉTATS STRICTS (FSM)
// ============================================

export const STEP_01_IDENTITY = 'STEP_01_IDENTITY';
export const STEP_02_TONE = 'STEP_02_TONE';
export const STEP_03_PREAMBULE = 'STEP_03_PREAMBULE';
export const STEP_03_BLOC1 = 'STEP_03_BLOC1'; // wait_start_button
export const PREAMBULE_DONE = 'PREAMBULE_DONE';
export const BLOC_01 = 'BLOC_01';

// ============================================
// HELPER : Construction historique conversationnel pour OpenAI
// ============================================
const MAX_CONV_MESSAGES = 40;

function buildConversationHistory(candidate: AxiomCandidate): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];
  
  // Utiliser conversationHistory si disponible
  if (candidate.conversationHistory && candidate.conversationHistory.length > 0) {
    const history = candidate.conversationHistory;
    // Prendre les N derniers messages (cap à MAX_CONV_MESSAGES)
    const recentHistory = history.slice(-MAX_CONV_MESSAGES);
    
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });
    return messages;
  }
  
  // Fallback sur answers (rétrocompatibilité)
  if (candidate.answers && candidate.answers.length > 0) {
    candidate.answers.forEach((answer) => {
      messages.push({
        role: 'user',
        content: answer.message,
      });
    });
  }
  
  return messages;
}

// ============================================
// HELPER : Dérivation d'état depuis l'historique
// ============================================
// PRIORITÉ A : Empêcher les retours en arrière
// Dérive l'état depuis l'historique du candidat si UI est null
function deriveStepFromHistory(candidate: AxiomCandidate): string {
  // Règle 1 : Si currentBlock > 0 → candidat est dans un bloc
  if (candidate.session.currentBlock > 0) {
    return `BLOC_${String(candidate.session.currentBlock).padStart(2, '0')}`;
  }
  
  // Règle 2 : Si réponses présentes → candidat a dépassé le préambule
  if (candidate.answers.length > 0) {
    return STEP_03_BLOC1;
  }
  
  // Règle 3 : Si tone choisi → candidat est au préambule ou après
  if (candidate.tonePreference) {
    return STEP_03_BLOC1;
  }
  
  // Règle 4 : Si identité complétée → candidat est au tone
  if (candidate.identity.completedAt) {
    return STEP_02_TONE;
  }
  
  // Règle 5 : Sinon → nouveau candidat, identité
  return STEP_01_IDENTITY;
}

// ============================================
// HELPER : Dérivation d'état depuis conversationHistory (source de vérité n°1)
// ============================================
function deriveStateFromConversationHistory(candidate: AxiomCandidate): string {
  const history = candidate.conversationHistory || [];
  
  // Si aucun historique → STEP_01_IDENTITY
  if (history.length === 0) {
    return STEP_01_IDENTITY;
  }
  
  // Trouver le dernier message assistant
  const lastAssistant = history.filter(m => m.role === 'assistant').pop();
  
  if (!lastAssistant) {
    // Aucun message assistant → STEP_01_IDENTITY
    return STEP_01_IDENTITY;
  }
  
  // Dériver selon le type de message
  if (lastAssistant.kind === 'tone') {
    // Question tone posée → Vérifier si réponse utilisateur existe
    const toneResponse = history.find(m => 
      m.role === 'user' && 
      m.createdAt > lastAssistant.createdAt
    );
    if (toneResponse) {
      // Réponse tone donnée → Préambule ou STEP_03_BLOC1
      const preambule = history.find(m => m.kind === 'preambule');
      if (preambule) {
        return STEP_03_BLOC1;  // Préambule généré → Attente bouton
      }
      return STEP_03_PREAMBULE;  // Préambule pas encore généré
    }
    return STEP_02_TONE;  // Question tone posée, réponse attendue
  }
  
  if (lastAssistant.kind === 'preambule') {
    // Préambule généré → STEP_03_BLOC1 (attente bouton)
    return STEP_03_BLOC1;
  }
  
  if (lastAssistant.kind === 'question') {
    // Question bloc posée → Vérifier dans quel bloc
    const lastUserMessage = history.filter(m => m.role === 'user').pop();
    if (lastUserMessage?.block) {
      return `BLOC_${String(lastUserMessage.block).padStart(2, '0')}`;
    }
    return BLOC_01;
  }
  
  // Fallback : utiliser deriveStepFromHistory existant
  return deriveStepFromHistory(candidate);
}

export const BLOC_02 = 'BLOC_02';
export const BLOC_03 = 'BLOC_03';
export const BLOC_04 = 'BLOC_04';
export const BLOC_05 = 'BLOC_05';
export const BLOC_06 = 'BLOC_06';
export const BLOC_07 = 'BLOC_07';
export const BLOC_08 = 'BLOC_08';
export const BLOC_09 = 'BLOC_09';
export const BLOC_10 = 'BLOC_10';
export const STEP_99_MATCH_READY = 'STEP_99_MATCH_READY';
export const STEP_99_MATCHING = 'STEP_99_MATCHING';
export const DONE_MATCHING = 'DONE_MATCHING';

export interface ExecuteAxiomResult {
  response: string;
  step: string;
  lastQuestion: string | null;
  tutoiement?: 'tutoiement' | 'vouvoiement';
  expectsAnswer: boolean;
  autoContinue: boolean;
  showStartButton?: boolean;
}

export interface ExecuteAxiomInput {
  candidate: AxiomCandidate;
  userMessage: string | null;
  event?: string;
}

// ============================================
// NORMALISATION INPUTS
// ============================================

function normalizeInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Supprimer accents
}

function extractIdentity(message: string): { firstName?: string; lastName?: string; email?: string } | null {
  const normalized = normalizeInput(message);
  const prenomMatch = normalized.match(/pr[ée]nom[:\s]+([^\n,]+)/i) || normalized.match(/prenom[:\s]+([^\n,]+)/i);
  const nomMatch = normalized.match(/nom[:\s]+([^\n,]+)/i);
  const emailMatch = normalized.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);

  if (prenomMatch && nomMatch && emailMatch) {
    return {
      firstName: prenomMatch[1].trim(),
      lastName: nomMatch[1].trim(),
      email: emailMatch[1].trim(),
    };
  }
  return null;
}

function detectTone(message: string): 'tutoiement' | 'vouvoiement' | null {
  const normalized = normalizeInput(message);
  const tutoiementPatterns = [
    'tutoie', 'tutoi', 'tutoy', 'tu ', 'on se tutoie', 'tutoiement',
  ];
  const vouvoiementPatterns = [
    'vouvoie', 'vouvoi', 'vouvoy', 'vous ', 'on se vouvoie', 'vouvoiement',
  ];

  for (const pattern of tutoiementPatterns) {
    if (normalized.includes(pattern)) {
      return 'tutoiement';
    }
  }
  for (const pattern of vouvoiementPatterns) {
    if (normalized.includes(pattern)) {
      return 'vouvoiement';
    }
  }
  return null;
}

// ============================================
// LOGGING OBLIGATOIRE
// ============================================

function logTransition(
  sessionId: string,
  stateIn: string,
  stateOut: string,
  inputType: 'message' | 'event',
): void {
  console.log('[AXIOM_STATE_TRANSITION]', {
    sessionId,
    stateIn,
    stateOut,
    inputType,
    timestamp: new Date().toISOString(),
  });
}

  // ============================================
  // RÈGLE CRITIQUE PROMPTS
  // ============================================
  // Le moteur AXIOM n'interprète pas les prompts.
  // Il les exécute STRICTEMENT.
  // Toute sortie LLM hors règles = invalide → rejouer le prompt.

  // ============================================
  // EXÉCUTEUR PRINCIPAL (FSM STRICTE)
  // ============================================

export async function executeAxiom(
  input: ExecuteAxiomInput,
): Promise<ExecuteAxiomResult> {
  const { candidate: inputCandidate, userMessage, event } = input;
  let candidate = inputCandidate;

  // PRIORITÉ A3 : INIT ÉTAT avec dérivation depuis conversationHistory (source de vérité n°1)
  // Synchronisation automatique FSM ← Historique
  let ui = candidate.session.ui;
  
  // Dériver l'état depuis conversationHistory
  const derivedState = deriveStateFromConversationHistory(candidate);
  
  if (!ui) {
    // UI n'existe pas → Créer depuis l'historique
    ui = {
      step: derivedState,
      lastQuestion: (() => {
        const history = candidate.conversationHistory || [];
        const lastAssistant = history.filter(m => m.role === 'assistant').pop();
        return lastAssistant?.content || null;
      })(),
      identityDone: !!candidate.identity.completedAt,
    };
    
    // Persister immédiatement l'état dérivé
    candidateStore.updateUIState(candidate.candidateId, ui);
    
    // Recharger le candidate pour avoir l'état à jour
    const updatedCandidate = candidateStore.get(candidate.candidateId);
    if (updatedCandidate && updatedCandidate.session.ui) {
      ui = updatedCandidate.session.ui;
      candidate = updatedCandidate;
    }
  } else {
    // UI existe → Vérifier si synchronisée avec l'historique
    if (ui.step !== derivedState) {
      // Désynchronisation détectée → Synchroniser
      const lastAssistant = (candidate.conversationHistory || []).filter(m => m.role === 'assistant').pop();
      candidateStore.updateUIState(candidate.candidateId, {
        step: derivedState,
        lastQuestion: lastAssistant?.content || ui.lastQuestion,
        tutoiement: ui.tutoiement || undefined,
        identityDone: ui.identityDone || !!candidate.identity.completedAt,
      });
      
      // Recharger le candidate
      const updatedCandidate = candidateStore.get(candidate.candidateId);
      if (updatedCandidate && updatedCandidate.session.ui) {
        ui = updatedCandidate.session.ui;
        candidate = updatedCandidate;
      }
    }
  }

  // UTILISER L'ÉTAT DÉRIVÉ (pas ui.step directement comme garde bloquante)
  let currentState = derivedState;
  const stateIn = currentState;

  // ============================================
  // STEP_01_IDENTITY
  // ============================================
  if (currentState === STEP_01_IDENTITY) {
    if (!userMessage) {
      // Première demande identité
      // Le front gère l'UI formulaire, on ne renvoie pas de message ici
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: '',
        step: 'IDENTITY',
        lastQuestion: null,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Parser identité
    const identity = extractIdentity(userMessage);
    if (!identity || !identity.firstName || !identity.lastName || !identity.email) {
      // Invalide → rester en identity
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: '',
        step: 'IDENTITY',
        lastQuestion: null,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Valide → stocker et passer à tone_choice
    candidateStore.updateIdentity(candidate.candidateId, {
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      completedAt: new Date(),
    });

    currentState = STEP_02_TONE;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      identityDone: true,
    });

    logTransition(candidate.candidateId, stateIn, currentState, 'message');

    // Enchaîner immédiatement avec question tone
    return await executeAxiom({
      candidate: candidateStore.get(candidate.candidateId)!,
      userMessage: null,
    });
  }

  // ============================================
  // STEP_02_TONE
  // ============================================
  if (currentState === STEP_02_TONE) {
    if (!userMessage) {
      // Première question tone
      const toneQuestion =
        'Bienvenue dans AXIOM.\n' +
        'On va découvrir qui tu es vraiment — pas ce qu\'il y a sur ton CV.\n' +
        'Promis : je ne te juge pas. Je veux juste comprendre comment tu fonctionnes.\n\n' +
        'On commence tranquille.\n' +
        'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
      
      // Enregistrer la réponse assistant
      if (toneQuestion) {
        candidateStore.appendAssistantMessage(candidate.candidateId, toneQuestion, {
          step: currentState,
          kind: 'tone',
        });
      }
      
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: toneQuestion,
        step: currentState,
        lastQuestion: toneQuestion,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Détecter tone
    const tone = detectTone(userMessage);
    if (!tone) {
      // Indécidable → répéter
      const toneQuestion =
        'On commence tranquille.\n' +
        'Dis-moi : tu préfères qu\'on se tutoie ou qu\'on se vouvoie pour cette discussion ?';
      
      // Enregistrer la réponse assistant
      if (toneQuestion) {
        candidateStore.appendAssistantMessage(candidate.candidateId, toneQuestion, {
          step: currentState,
          kind: 'tone',
        });
      }
      
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: toneQuestion,
        step: currentState,
        lastQuestion: toneQuestion,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // PARTIE 4 — tone_choice → preambule → wait_start_button
    // SI VALIDE : En UN SEUL RETURN :
    // - envoyer le PRÉAMBULE COMPLET
    // - expectsAnswer = false
    // - step = "STEP_03_BLOC1"
    // - state = "wait_start_button"

    // Stocker tone
    candidateStore.setTonePreference(candidate.candidateId, tone);
    
    // Transition vers STEP_03_PREAMBULE et auto-enchaînement
    currentState = STEP_03_PREAMBULE;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      tutoiement: tone || undefined,
      identityDone: true,
    });
    
    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    
    // Auto-enchaînement : appeler executeAxiom immédiatement pour générer le préambule
    return await executeAxiom({
      candidate: candidateStore.get(candidate.candidateId)!,
      userMessage: null,
    });
  }

  // ============================================
  // STEP_03_PREAMBULE
  // ============================================
  if (currentState === STEP_03_PREAMBULE) {
    // Charger et exécuter le préambule STRICTEMENT
    let aiText: string | null = null;
    const messages = buildConversationHistory(candidate);

    try {
      const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: `RÈGLE ABSOLUE AXIOM :
Tu es en état STEP_03_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET tel que défini dans le prompt.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule, mot pour mot selon les instructions.
AUCUNE reformulation, AUCUNE improvisation, AUCUNE question.`,
          },
          ...messages,
        ],
      });

      if (typeof completion === 'string' && completion.trim()) {
        aiText = completion.trim();
      }
    } catch (e) {
      console.error('[AXIOM_EXECUTION_ERROR]', e);
    }

    // Si échec → réessayer une fois
    if (!aiText) {
      try {
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const completion = await callOpenAI({
          messages: [
            { role: 'system', content: FULL_AXIOM_PROMPT },
            {
              role: 'system',
              content: `RÈGLE ABSOLUE AXIOM :
Tu es en état STEP_03_PREAMBULE.
Tu dois afficher LE PRÉAMBULE MÉTIER COMPLET tel que défini dans le prompt.
Tu NE POSES PAS de question.
Tu affiches uniquement le préambule, mot pour mot selon les instructions.
AUCUNE reformulation, AUCUNE improvisation, AUCUNE question.`,
            },
            ...messages,
          ],
        });

        if (typeof completion === 'string' && completion.trim()) {
          aiText = completion.trim();
        }
      } catch (e) {
        console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
      }
    }

    // Si toujours vide → utiliser le texte du prompt directement
    if (!aiText) {
      const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
      const extractedPreambule = extractPreambuleFromPrompt(FULL_AXIOM_PROMPT);

      if (extractedPreambule) {
        aiText = extractedPreambule;
      } else {
        // Fallback minimal (texte du prompt)
        aiText =
          'Avant de commencer vraiment, je te pose simplement le cadre.\n\n' +
          'Le métier concerné est celui de courtier en énergie.\n\n' +
          'Il consiste à accompagner des entreprises dans la gestion de leurs contrats d\'électricité et de gaz :\n' +
          '• analyse de l\'existant,\n' +
          '• renégociation auprès des fournisseurs,\n' +
          '• sécurisation des prix,\n' +
          '• suivi dans la durée.\n\n' +
          'Le client final ne paie rien directement.\n' +
          'La rémunération est versée par les fournisseurs, à la signature et sur la durée du contrat.\n\n' +
          'Il n\'y a aucune garantie.\n' +
          'Certains gagnent peu. D\'autres gagnent très bien.\n\n' +
          'La différence ne vient ni du marché, ni du produit, ni de la chance,\n' +
          'mais de la constance, de l\'autonomie, et de la capacité à tenir dans un cadre exigeant.\n\n' +
          'C\'est précisément pour ça qu\'AXIOM existe.\n\n' +
          'AXIOM n\'est ni un test, ni un jugement, ni une sélection déguisée.\n\n' +
          'Il n\'est pas là pour te vendre ce métier, ni pour te faire entrer dans une case.\n\n' +
          'Son rôle est simple :\n' +
          'prendre le temps de comprendre comment tu fonctionnes réellement dans le travail,\n' +
          'et te donner une lecture lucide de ce que ce cadre exige au quotidien.\n\n' +
          'Pour certains profils, c\'est un terrain d\'expression très fort.\n' +
          'Pour d\'autres, tout aussi solides, d\'autres environnements sont simplement plus cohérents.\n\n' +
          'AXIOM est là pour apporter de la clarté :\n' +
          '• sans pression,\n' +
          '• sans promesse,\n' +
          '• sans te pousser dans une direction.';
      }
    }

    // Transition immédiate vers wait_start_button
    currentState = STEP_03_BLOC1;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      tutoiement: ui.tutoiement || undefined,
      identityDone: true,
    });

    // Enregistrer la réponse assistant (préambule)
    if (aiText) {
      candidateStore.appendAssistantMessage(candidate.candidateId, aiText, {
        step: STEP_03_BLOC1,
        kind: 'preambule',
      });
    }
    
    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    return {
      response: aiText || '',
      step: STEP_03_BLOC1,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false, // déclenchement explicite requis
    };
  }

  // ============================================
  // STEP_03_BLOC1 (wait_start_button)
  // ============================================
  // Vérifier si préambule existe dans l'historique (source de vérité n°1)
  const preambuleInHistory = candidate.conversationHistory?.find(m => m.kind === 'preambule');
  const canStartBloc1 = currentState === STEP_03_BLOC1 || preambuleInHistory !== undefined;
  
  if (canStartBloc1) {
    // PARTIE 5 — Bouton "Je commence mon profil"
    if (event === 'START_BLOC_1') {
      // Mettre à jour l'état UI vers BLOC_01
      candidateStore.updateUIState(candidate.candidateId, {
        step: BLOC_01,
        lastQuestion: null,
        tutoiement: ui.tutoiement || undefined,
        identityDone: true,
      });

      // Mettre à jour la session vers collecting + bloc 1
      candidateStore.updateSession(candidate.candidateId, { state: 'collecting', currentBlock: 1 });

      // Récupérer le candidate mis à jour
      let updatedCandidate = candidateStore.get(candidate.candidateId);
      if (!updatedCandidate) {
        throw new Error('Candidate not found after update');
      }

      // Appeler OpenAI EXACTEMENT comme dans la section "BLOCS 1 à 10" avec userMessage = null
      const blocNumber = 1;
      const messages = buildConversationHistory(updatedCandidate);

      let aiText: string | null = null;

      try {
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const completion = await callOpenAI({
          messages: [
            { role: 'system', content: FULL_AXIOM_PROMPT },
            {
              role: 'system',
              content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état BLOC_01 (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`,
            },
            ...messages,
          ],
        });

        if (typeof completion === 'string' && completion.trim()) {
          aiText = completion.trim();
        }
      } catch (e) {
        console.error('[AXIOM_EXECUTION_ERROR]', e);
      }

      // Si échec → réessayer une fois
      if (!aiText) {
        try {
          const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
          const completion = await callOpenAI({
            messages: [
              { role: 'system', content: FULL_AXIOM_PROMPT },
              {
                role: 'system',
                content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état BLOC_01 (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`,
              },
              ...messages,
            ],
          });

          if (typeof completion === 'string' && completion.trim()) {
            aiText = completion.trim();
          }
        } catch (e) {
          console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
        }
      }

      // Si toujours vide → utiliser lastQuestion
      if (!aiText) {
        aiText = updatedCandidate.session.ui?.lastQuestion || '';
      }

      // Si toujours vide → erreur critique
      if (!aiText) {
        console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: updatedCandidate.candidateId, state: BLOC_01 });
        throw new Error('Failed to generate BLOC 1 question');
      }

      const expectsAnswer = aiText.trim().endsWith('?');
      const lastQuestion: string | null = expectsAnswer ? aiText : null;

      // Mettre à jour lastQuestion dans l'UI state
      candidateStore.updateUIState(updatedCandidate.candidateId, {
        step: BLOC_01,
        lastQuestion,
        tutoiement: ui.tutoiement || undefined,
        identityDone: true,
      });

      logTransition(updatedCandidate.candidateId, stateIn, BLOC_01, 'event');

      // Retourner la première question du BLOC 1
      return {
        response: aiText,
        step: BLOC_01,
        lastQuestion,
        expectsAnswer: true,
        autoContinue: false,
      };
    }

    // Si message texte reçu → ignorer (on attend le bouton)
    // MAIS : Si préambule existe dans l'historique, on est bien en STEP_03_BLOC1
    logTransition(candidate.candidateId, stateIn, STEP_03_BLOC1, 'message');
    return {
      response: '',
      step: STEP_03_BLOC1,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // ============================================
  // BLOCS 1 à 10
  // ============================================
  const blocStates = [BLOC_01, BLOC_02, BLOC_03, BLOC_04, BLOC_05, BLOC_06, BLOC_07, BLOC_08, BLOC_09, BLOC_10];
  if (blocStates.includes(currentState as any)) {
    const blocNumber = blocStates.indexOf(currentState as any) + 1;

    // Construire l'historique depuis conversationHistory
    const messages = buildConversationHistory(candidate);
    
    // Ajouter le message utilisateur actuel s'il existe (sera stocké après)
    if (userMessage) {
      messages.push({ role: 'user', content: userMessage });
    }

    let aiText: string | null = null;

    try {
      const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: FULL_AXIOM_PROMPT },
          {
            role: 'system',
            content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état ${currentState} (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`,
          },
          ...messages,
        ],
      });

      if (typeof completion === 'string' && completion.trim()) {
        aiText = completion.trim();
      }
    } catch (e) {
      console.error('[AXIOM_EXECUTION_ERROR]', e);
    }

    // Si échec → réessayer une fois
    if (!aiText) {
      try {
        const FULL_AXIOM_PROMPT = getFullAxiomPrompt();
        const completion = await callOpenAI({
          messages: [
            { role: 'system', content: FULL_AXIOM_PROMPT },
            {
              role: 'system',
              content: `RÈGLE ABSOLUE AXIOM :
Le moteur AXIOM n'interprète pas les prompts. Il les exécute STRICTEMENT.
Tu es en état ${currentState} (BLOC ${blocNumber}).
Tu exécutes STRICTEMENT le protocole AXIOM pour ce bloc.
Tu produis UNIQUEMENT le texte autorisé à cette étape.
INTERDICTIONS : improviser, commenter le système, reformuler le prompt, revenir en arrière.
Si tu dois poser une question, pose-la. Si tu dois afficher un miroir, affiche-le.
AUCUNE sortie générique type "On continue", "D'accord", etc.
Toute sortie hors règles = invalide.`,
            },
            ...messages,
          ],
        });

        if (typeof completion === 'string' && completion.trim()) {
          aiText = completion.trim();
        }
      } catch (e) {
        console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
      }
    }

    // Si toujours vide → utiliser lastQuestion
    if (!aiText) {
      aiText = ui.lastQuestion || '';
    }

    // Si toujours vide → erreur critique
    if (!aiText) {
      console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: candidate.candidateId, state: currentState });
      logTransition(candidate.candidateId, stateIn, DONE_MATCHING, 'message');
      return {
        response: 'Erreur technique. Veuillez réessayer.',
        step: DONE_MATCHING,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }

    const expectsAnswer = aiText.trim().endsWith('?');
    let lastQuestion: string | null = null;
    if (expectsAnswer) {
      lastQuestion = aiText;
    }

    // Stocker la réponse utilisateur
    if (userMessage) {
      const answerRecord: AnswerRecord = {
        block: blocNumber,
        message: userMessage,
        createdAt: new Date().toISOString(),
      };
      candidateStore.addAnswer(candidate.candidateId, answerRecord);
      
      // AUSSI stocker dans conversationHistory
      candidateStore.appendUserMessage(candidate.candidateId, userMessage, {
        block: blocNumber,
        step: currentState,
        kind: 'other',
      });
    }

    // Déterminer l'état suivant
    let nextState = currentState;
    if (!expectsAnswer && blocNumber < 10) {
      // Fin du bloc → passer au suivant
      nextState = blocStates[blocNumber] as any;
    } else if (!expectsAnswer && blocNumber === 10) {
      // Fin du bloc 10 → générer synthèse et passer à match_ready
      // TODO: Générer synthèse finale
      nextState = STEP_99_MATCH_READY;
      candidateStore.setFinalProfileText(candidate.candidateId, aiText);
    }

    candidateStore.updateUIState(candidate.candidateId, {
      step: nextState,
      lastQuestion,
      tutoiement: ui.tutoiement || undefined,
      identityDone: true,
    });
    
    // Enregistrer la réponse assistant APRÈS avoir déterminé nextState
    if (aiText) {
      candidateStore.appendAssistantMessage(candidate.candidateId, aiText, {
        block: blocNumber,
        step: nextState,
        kind: expectsAnswer ? 'question' : 'mirror',
      });
    }

    logTransition(candidate.candidateId, stateIn, nextState, userMessage ? 'message' : 'event');

    // Si fin du bloc 10 → transition automatique
    if (nextState === STEP_99_MATCH_READY) {
      const finalResponse = (aiText || '') + '\n\nProfil terminé. Quand tu es prêt, génère ton matching.';
      
      // Enregistrer la réponse assistant finale
      if (finalResponse) {
        candidateStore.appendAssistantMessage(candidate.candidateId, finalResponse, {
          step: nextState,
          kind: 'other',
        });
      }
      
      return {
        response: finalResponse,
        step: nextState,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }

    return {
      response: aiText || '',
      step: nextState,
      lastQuestion,
      expectsAnswer,
      autoContinue: false,
    };
  }

  // ============================================
  // STEP_99_MATCH_READY
  // ============================================
  if (currentState === STEP_99_MATCH_READY) {
    // Attendre le bouton "Je génère mon matching"
    if (!userMessage && !event) {
      logTransition(candidate.candidateId, stateIn, currentState, 'message');
      return {
        response: 'Profil terminé. Quand tu es prêt, génère ton matching.',
        step: currentState,
        lastQuestion: null,
        expectsAnswer: false,
        autoContinue: false,
      };
    }

    // Passer à matching
    currentState = STEP_99_MATCHING;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      tutoiement: ui.tutoiement || undefined,
      identityDone: true,
    });

    logTransition(candidate.candidateId, stateIn, currentState, 'message');

    // Enchaîner immédiatement avec matching
    return await executeAxiom({
      candidate: candidateStore.get(candidate.candidateId)!,
      userMessage: null,
    });
  }

  // ============================================
  // STEP_99_MATCHING
  // ============================================
  if (currentState === STEP_99_MATCHING) {
    let aiText: string | null = null;

    try {
      const MATCHING_PROMPT = getMatchingPrompt();
      const messages = buildConversationHistory(candidate);

      // Ajouter la synthèse finale si disponible
      if (candidate.finalProfileText) {
        messages.push({ role: 'system', content: `SYNTHÈSE FINALE AXIOM:\n${candidate.finalProfileText}` });
      }

      const completion = await callOpenAI({
        messages: [
          { role: 'system', content: MATCHING_PROMPT },
          ...messages,
        ],
      });

      if (typeof completion === 'string' && completion.trim()) {
        aiText = completion.trim();
      }
    } catch (e) {
      console.error('[AXIOM_EXECUTION_ERROR]', e);
    }

    // Si échec → réessayer une fois
    if (!aiText) {
      try {
        const MATCHING_PROMPT = getMatchingPrompt();
        const messages = buildConversationHistory(candidate);

        if (candidate.finalProfileText) {
          messages.push({ role: 'system', content: `SYNTHÈSE FINALE AXIOM:\n${candidate.finalProfileText}` });
        }

        const completion = await callOpenAI({
          messages: [
            { role: 'system', content: MATCHING_PROMPT },
            ...messages,
          ],
        });

        if (typeof completion === 'string' && completion.trim()) {
          aiText = completion.trim();
        }
      } catch (e) {
        console.error('[AXIOM_EXECUTION_ERROR_RETRY]', e);
      }
    }

    // Si toujours vide → erreur
    if (!aiText) {
      console.error('[AXIOM_CRITICAL_ERROR]', { sessionId: candidate.candidateId, state: currentState });
      aiText = 'Erreur lors de la génération du matching. Veuillez réessayer.';
    }

    currentState = DONE_MATCHING;
    candidateStore.updateUIState(candidate.candidateId, {
      step: currentState,
      lastQuestion: null,
      tutoiement: ui.tutoiement || undefined,
      identityDone: true,
    });

    // Enregistrer la réponse assistant (matching)
    if (aiText) {
      candidateStore.appendAssistantMessage(candidate.candidateId, aiText, {
        step: currentState,
        kind: 'matching',
      });
    }
    
    logTransition(candidate.candidateId, stateIn, currentState, 'message');
    return {
      response: aiText || '',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // ============================================
  // DONE_MATCHING
  // ============================================
  if (currentState === DONE_MATCHING) {
    logTransition(candidate.candidateId, stateIn, currentState, userMessage ? 'message' : 'event');
    return {
      response: '',
      step: currentState,
      lastQuestion: null,
      expectsAnswer: false,
      autoContinue: false,
    };
  }

  // État inconnu
  console.error('[AXIOM_UNKNOWN_STATE]', { sessionId: candidate.candidateId, state: currentState });
  logTransition(candidate.candidateId, stateIn, DONE_MATCHING, 'message');
  return {
    response: 'Erreur technique. Veuillez réessayer.',
    step: DONE_MATCHING,
    lastQuestion: null,
    expectsAnswer: false,
    autoContinue: false,
  };
}

// ============================================
// AUTO-ENCHAÎNEMENT FSM STRICT
// ============================================

export async function executeWithAutoContinue(
  candidate: AxiomCandidate,
  userMessage: string | null = null,
): Promise<ExecuteAxiomResult> {
  let result = await executeAxiom({
    candidate,
    userMessage: userMessage,
  });

  // 🔁 AUTO-ENCHAÎNEMENT FSM STRICT
  // Tant que l'état est non interactif ET demande à continuer
  while (
    result &&
    result.expectsAnswer === false &&
    result.autoContinue === true
  ) {
    // Recharger le candidate pour avoir l'état à jour
    const updatedCandidate = candidateStore.get(candidate.candidateId);
    if (!updatedCandidate) {
      break;
    }
    
    result = await executeAxiom({
      candidate: updatedCandidate,
      userMessage: null,
    });
  }

  return result;
}
