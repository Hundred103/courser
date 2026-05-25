import { QuestionCreateDTO, QuestionPlayDTO } from './question.model';

export interface QuizRawDTO {
  id: number;
  title: string;
}

export interface QuizPlayDTO {
  id: number;
  title: string;
  questions: QuestionPlayDTO[];
}

export interface QuizCreateDTO {
  title: string;
  questions: QuestionCreateDTO[];
}

export interface QuizEditTitleDTO {
  title: string;
}
