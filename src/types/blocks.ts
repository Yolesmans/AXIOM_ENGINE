export interface QuestionQueue {
  blockNumber: number;
  questions: string[];
  cursorIndex: number;
  isComplete: boolean;
  generatedAt: string;
  completedAt: string | null;
}

export interface AnswerMap {
  blockNumber: number;
  answers: Record<number, string>;
  lastAnswerAt: string;
}
