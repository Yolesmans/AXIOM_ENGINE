export const STATIC_QUESTIONS = {
    // BLOC 1 : questions prédéfinies — formulation exacte du prompt V8
    1: [
        `Tu te sens plus poussé par :

A. Le fait de progresser, devenir meilleur
B. Le fait d'atteindre des objectifs concrets
C. Le fait d'être reconnu pour ce que tu fais`,
        `Quand tu es en rythme, ton énergie est plutôt :

A. Stable, constante
B. En pics, tu carbures fort puis tu souffles`,
        `La pression :

A. Te structure
B. Te fatigue si elle vient des autres
C. Tu la crées toi-même pour avancer`,
        `Quand un projet t'ennuie, tu :

A. Le bâcles pour passer à autre chose
B. Tu procrastines mais tu le termines
C. Tu cherches à le transformer pour y trouver un intérêt`,
        `Raconte-moi une situation où tu t'es senti pleinement vivant, aligné, efficace.`,
    ],
    // BLOC 3 : 3 questions (aligné prompt V8 — bloc semi-guidé)
    3: [
        `Quand tu dois prendre une décision importante, tu te fies plutôt à :

A. Ce qui est logique et cohérent
B. Ce que tu ressens comme juste
C. Ce qui a déjà fait ses preuves
D. Ce qui t'ouvre le plus d'options`,
        `Quand tu fais face à une situation que tu juges injuste :

A. Tu réagis immédiatement
B. Tu prends sur toi mais tu t'en souviens
C. Tu analyses avant d'agir
D. Tu évites le conflit si possible`,
        `En une phrase maximum : qu'est-ce qui te met le plus hors de toi chez les autres ?`,
    ],
    // BLOC 4 : 5 questions — formulation exacte du prompt V8 (parties 4.1 + début 4.2)
    4: [
        `Si tu devais citer 3 compétences que tu utilises vraiment aujourd'hui dans ta vie pro
(pas celles que tu aimerais avoir, pas celles que tu as vues une fois),
ce serait lesquelles ?`,
        `Sur chaque compétence citée, tu te situes plutôt :

A. Débutant
B. Opérationnel
C. Très à l'aise / référent`,
        `As-tu aujourd'hui un ou plusieurs diplômes, titres ou certifications reconnus ?

A. Oui
B. Non
C. Je passe`,
        `Parmi ce que tu viens de citer, qu'est-ce qui te sert le plus concrètement dans ton quotidien pro aujourd'hui ?`,
        `Cite-moi 2 ou 3 choses que tu fais vraiment bien, au point que les autres te le disent
(clients, collègues, managers, proches).`,
    ],
    5: [
        `Si tu pouvais te projeter dans 5 ans sans te censurer, tu te vois où ?`,
        `Tu te reconnais plutôt dans quel type de trajectoire ?

A. Un job stable, sans trop de vagues
B. Un job qui monte en responsabilités
C. Créer / diriger quelque chose à toi`,
        `Pour ta vie pro aujourd'hui, tu serais prêt à sacrifier quoi réellement ?

A. Du temps
B. Du confort
C. De la sécurité
D. Rien de tout ça`,
    ],
    // BLOC 6 : 4 questions — formulation exacte du prompt V8
    6: [
        `Tu habites où (ville ou zone) et jusqu'où tu es prêt à te déplacer vraiment ?`,
        `Un salaire qui te permet de vivre correctement aujourd'hui, c'est combien (fourchette) ?`,
        `Tes horaires idéaux, c'est plutôt :

A. Fixes et prévisibles
B. Flexibles, tu gères ton temps
C. Imprévisibles mais bien rémunérés`,
        `Le télétravail pour toi c'est :

A. Un besoin absolu
B. Un vrai confort appréciable
C. Tu t'en fiches complètement`,
    ],
    // BLOC 7 : 4 questions — formulation exacte du prompt V8
    7: [
        `Spontanément, si tu devais mettre un mot sur "ce que tu es" pro, ce serait quoi ?
(ex : vendeur, créatif, organisateur, soigneur, etc.)`,
        `Si on enlève la question de diplôme, tu rêverais d'être quoi ?`,
        `Et si on enlève la peur et le regard des autres, tu serais quoi ?`,
        `Tu es prêt à te former combien de temps pour changer de voie ?

A. Pas du tout / zéro formation
B. Quelques semaines / 6 mois max
C. Un an ou plus`,
    ],
    // BLOC 8 : 3 questions — formulation exacte du prompt V8
    8: [
        `Le meilleur "chef" que tu aies eu, il ressemblait à quoi ?`,
        `Le pire, il faisait quoi exactement ?`,
        `Tu te vois, un jour, manager des gens ?
Si oui, tu serais quel type de manager ?`,
    ],
    // BLOC 9 : 3 questions — formulation exacte du prompt V8
    9: [
        `En soirée ou en équipe, tu es plutôt :

A. Au centre — tu prends la parole, tu fédères
B. Dans un petit groupe — tu t'exprimes mieux en cercle restreint
C. En retrait à observer — tu écoutes et tu analyses`,
        `Quand quelqu'un dépasse une limite avec toi (irrespect, injustice), tu réagis comment en vrai ?`,
        `Tu as besoin de voir du monde au travail, ou ça te draine ?`,
    ],
};
// Seuils EXACTS pour déclencher les miroirs (alignés au SUPER-PROMPT V8)
// BLOC 1→5, BLOC 3→3, BLOC 4→5, BLOC 5→3, BLOC 6→4, BLOC 7→4, BLOC 8→3, BLOC 9→3
export const EXPECTED_ANSWERS_FOR_MIRROR = {
    1: STATIC_QUESTIONS[1].length, // 5
    2: 0, // miroir BLOC 2B géré par blockOrchestrator (pas de comptage statique)
    3: STATIC_QUESTIONS[3].length, // 3
    4: STATIC_QUESTIONS[4].length, // 5
    5: STATIC_QUESTIONS[5].length, // 3
    6: STATIC_QUESTIONS[6].length, // 4
    7: STATIC_QUESTIONS[7].length, // 4
    8: STATIC_QUESTIONS[8].length, // 3
    9: STATIC_QUESTIONS[9].length, // 3
};
export function getStaticQuestion(blocNumber, questionIndex) {
    const arr = STATIC_QUESTIONS[blocNumber];
    if (!arr)
        return null;
    return arr[questionIndex] ?? null;
}
