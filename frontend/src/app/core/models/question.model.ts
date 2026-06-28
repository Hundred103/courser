import { AnswerCreateDTO, AnswerPlayDTO } from './answer.model';

export interface QuestionPlayDTO {
  id: number;
  content: string;
  answers: AnswerPlayDTO[];
  image?: string | null;
}

export interface QuestionCreateDTO {
  content: string;
  answers: AnswerCreateDTO[];
  image?: string | null;
}
