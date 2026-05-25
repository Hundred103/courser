import { AnswerCreateDTO, AnswerPlayDTO } from './answer.model';

export interface QuestionPlayDTO {
  id: number;
  content: string;
  answers: AnswerPlayDTO[];
}

export interface QuestionCreateDTO {
  content: string;
  answers: AnswerCreateDTO[];
}
