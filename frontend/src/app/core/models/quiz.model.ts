import { QuestionCreateDTO, QuestionPlayDTO } from './question.model';
import { QuizLimits } from './quiz-limits.model';
import { QuizScoring } from '../utils/quiz-scoring.util';

export interface QuizRawDTO {
  id: number;
  title: string;
}

export interface QuizPlayDTO {
  id: number;
  title: string;
  questions: QuestionPlayDTO[];
  scoring?: QuizScoring | null;
  limits?: QuizLimits | null;
}

export interface QuizCreateDTO {
  title: string;
  questions: QuestionCreateDTO[];
  scoring?: QuizScoring | null;
  limits?: QuizLimits | null;
}

export interface QuizEditTitleDTO {
  title: string;
}
