export interface QuizRawDTO {
  id: number;
  title: string;
}

export interface AnswerPlayDTO {
  id: number;
  content: string;
  correct: boolean;
}

export interface QuestionPlayDTO {
  id: number;
  content: string;
  answers: AnswerPlayDTO[];
}

export interface QuizPlayDTO {
  id: number;
  title: string;
  questions: QuestionPlayDTO[];
}
