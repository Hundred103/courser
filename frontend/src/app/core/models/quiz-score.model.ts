export interface SaveQuizResultRequest {
  quizId: number;
  score: number;
  maxScore: number;
}

export interface BestQuizScore {
  quizId: number;
  score: number;
  maxScore: number;
}
