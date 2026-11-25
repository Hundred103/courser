export interface AnswerPlayDTO {
  id: number;
  content: string;
  correct: boolean;
  points?: number | null;
}

export interface AnswerCreateDTO {
  content: string;
  correct: boolean;
  points?: number | null;
}
