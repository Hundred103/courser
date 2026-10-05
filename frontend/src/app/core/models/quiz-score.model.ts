export interface SaveQuizResultRequest {
  quizId: number;
  score: number;
  maxScore: number;
  attemptId?: number | null;
}

export interface BestQuizScore {
  quizId: number;
  score: number;
  maxScore: number;
}
