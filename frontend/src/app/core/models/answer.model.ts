export interface AnswerPlayDTO {
  id: number;
  content: string;
  correct: boolean;
}

export interface AnswerCreateDTO {
  content: string;
  correct: boolean;
}
