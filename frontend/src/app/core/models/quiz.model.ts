import { QuestionCreateDTO, QuestionPlayDTO } from './question.model';
import { QuizLimits } from './quiz-limits.model';
import { QuizScoring } from '../utils/quiz-scoring.util';

export interface QuizRawDTO {
  id: number;
  title: string;
  rankingProtected?: boolean;
}

export interface QuizPlayDTO {
  id: number;
  title: string;
  questions: QuestionPlayDTO[];
  scoring?: QuizScoring | null;
  limits?: QuizLimits | null;
  rankingEnabled?: boolean;
  rankingProtected?: boolean;
}

export interface RankingEntryDTO { position: number; username: string; scoreScaled: number; maxScoreScaled: number; durationMs: number; }
export interface RankingFinishDTO { scoreScaled: number; maxScoreScaled: number; durationMs: number; position: number | null; outsideTopFive: boolean; leaderboard: RankingEntryDTO[]; }
export interface RankingLeaderboardDTO { position: number | null; leaderboard: RankingEntryDTO[]; }

export interface QuizCreateDTO {
  title: string;
  questions: QuestionCreateDTO[];
  scoring?: QuizScoring | null;
  limits?: QuizLimits | null;
}

export interface QuizEditTitleDTO {
  title: string;
}
