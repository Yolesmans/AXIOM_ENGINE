export const STATIC_QUESTIONS: Record<number, string[]> = {
  // BLOC 1 : questions prédéfinies
  1: [
    `Tu te sens plus poussé par :
A. Le fait de progresser, devenir meilleur,
B. Le fait d'atteindre des objectifs concrets,
C. Le fait d'être reconnu pour ce que tu fais ?`,
    `Quand tu es en rythme, ton énergie est plutôt :
A. Stable, constante,
B. En pics, tu carbures fort puis tu souffles ?`,
    `La pression :
A. Te structure,
B. Te fatigue si elle vient des autres,
C. Tu la crées toi-même pour avancer ?`,
    `Quand un projet t'ennuie, tu :
A. Le bâcles pour passer à autre chose,
B. Tu procrastines mais tu le termines,
C. Tu cherches à le transformer pour y trouver un intérêt ?`,
    `Raconte-moi une situation où tu t'es senti pleinement vivant, aligné, efficace.`,
  ],

  // BLOC 3 : 3 questions (aligné prompt)
  3: [
    `Quand tu dois prendre une décision importante, tu te fies plutôt à :
A. Ce qui est logique et cohérent
B. Ce que tu ressens comme juste
C. Ce qui a déjà fait ses preuves
D. Ce qui t'ouvre le plus d'options
(1 lettre)`,
    `Quand tu fais face à une situation que tu juges injuste :
A. Tu réagis immédiatement
B. Tu prends sur toi mais tu t'en souviens
C. Tu analyses avant d'agir
D. Tu évites le conflit si possible
(1 lettre)`,
    `En une phrase maximum : qu'est-ce qui te met le plus hors de toi chez les autres ?`,
  ],

  // BLOCS 4→9 : 5 questions chacun
  4: [
    `Si tu devais citer 3 compétences que tu utilises vraiment aujourd'hui dans ta vie pro (pas celles que tu aimerais avoir, pas celles que tu as vues une fois), ce serait lesquelles ?`,
    `Sur chaque compétence citée, tu te situes plutôt : A. Débutant  B. Opérationnel  C. Très à l'aise / référent`,
    `As-tu aujourd'hui un ou plusieurs diplômes, titres ou certifications reconnus ? A. Oui  B. Non  C. Je passe`,
    `Parmi ce que tu viens de citer, qu'est-ce qui te sert le plus concrètement dans ton quotidien pro aujourd'hui ?`,
    `Cite-moi 2 ou 3 choses que tu fais vraiment bien, au point que les autres te le disent (clients, collègues, managers, proches).`,
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
    `Pourquoi c'est important pour toi ?`,
    `Qu'est-ce qui te motive vraiment dans cette projection ?`,
  ],
  6: [
    `Tu habites où (ville ou zone) et jusqu'où tu es prêt à te déplacer vraiment ?`,
    `Un salaire qui te permet de vivre correctement aujourd'hui, c'est combien (fourchette) ?`,
    `Plutôt horaires fixes, plutôt flexibles, plutôt imprévisibles mais bien payés ?`,
    `Télétravail : besoin, confort, ou tu t'en fiches ?`,
    `Quelles contraintes sont non négociables pour toi aujourd'hui ?`,
  ],
  7: [
    `Spontanément, si tu devais mettre un mot sur "ce que tu es" pro, ce serait quoi ? (ex : vendeur, créatif, organisateur, soigneur, etc.)`,
    `Si on enlève la question de diplôme, tu rêverais d'être quoi ?`,
    `Et si on enlève la peur et le regard des autres, tu serais quoi ?`,
    `Tu es prêt à te former combien de temps pour changer de voie (0, 6 mois, 1 an, plus) ?`,
    `Qu'est-ce qui te fait dire que ce métier te correspond ?`,
  ],
  8: [
    `Le meilleur "chef" que tu aies eu, il ressemblait à quoi ?`,
    `Le pire, il faisait quoi exactement ?`,
    `Tu te vois, un jour, manager des gens ? Si oui, tu serais quel type de manager ?`,
    `Qu'est-ce qui te fait avancer avec un manager ?`,
    `Qu'est-ce qui te bloque avec un manager ?`,
  ],
  9: [
    `En soirée ou en équipe, tu es plutôt : au centre, dans un petit groupe, en retrait à observer ?`,
    `Quand quelqu'un dépasse une limite avec toi (irrespect, injustice), tu réagis comment en vrai ?`,
    `Tu as besoin de voir du monde au travail, ou ça te draine ?`,
    `Tu fonctionnes mieux seul ou en équipe au quotidien ?`,
    `Comment tu gères les désaccords avec un collègue ?`,
  ],
};

// Seuils EXACTS pour déclencher les miroirs (alignés au catalogue)
export const EXPECTED_ANSWERS_FOR_MIRROR: Record<number, number> = {
  1: STATIC_QUESTIONS[1].length,
  3: STATIC_QUESTIONS[3].length,
  4: STATIC_QUESTIONS[4].length,
  5: STATIC_QUESTIONS[5].length,
  6: STATIC_QUESTIONS[6].length,
  7: STATIC_QUESTIONS[7].length,
  8: STATIC_QUESTIONS[8].length,
  9: STATIC_QUESTIONS[9].length,
};

export function getStaticQuestion(blocNumber: number, questionIndex: number): string | null {
  const arr = STATIC_QUESTIONS[blocNumber];
  if (!arr) return null;
  return arr[questionIndex] ?? null;
}
