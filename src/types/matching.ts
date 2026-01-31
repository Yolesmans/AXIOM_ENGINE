export type MatchingResult = {
  verdict: string;   // 1ère ligne non vide du matching (tronquée 80 chars)
  summary: string;   // 2-3 premières lignes non vides (tronquées 240 chars)
  fullText: string;  // texte complet renvoyé par le prompt matching
  createdAt: string; // ISO
};
