import { Injectable } from '@angular/core';
import { QuizCreateDTO, QuizPlayDTO, QuizRawDTO } from '../models/quiz.model';
import { normalizeQuizLimits } from '../models/quiz-limits.model';
import { normalizeQuizScoring } from '../utils/quiz-scoring.util';
import { QuizUserError } from '../utils/quiz-request.util';

const STORAGE_KEY = 'guestQuizzes';

export interface GuestQuizImport {
  quiz: QuizCreateDTO;
  rankingVersionId: string | null;
}

interface StoredGuestQuiz extends QuizPlayDTO {
  rankingVersionId?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class GuestQuizStorageService {
  getAllRaw(): QuizRawDTO[] {
    return this.loadQuizzes().map((quiz) => this.toRaw(quiz));
  }

  getById(id: number): QuizPlayDTO | null {
    return this.loadQuizzes().find((quiz) => quiz.id === id) ?? null;
  }

  create(dto: QuizCreateDTO, rankingVersionId: string | null = null): QuizRawDTO {
    const quizzes = this.loadQuizzes();
    const quiz = this.toLocalQuiz(dto, rankingVersionId);
    this.saveQuizzes([...quizzes, quiz]);

    return this.toRaw(quiz);
  }

  delete(id: number): void {
    this.saveQuizzes(this.loadQuizzes().filter((quiz) => quiz.id !== id));
  }

  getAllImports(): (GuestQuizImport & { id: number })[] {
    return this.loadQuizzes().map((quiz) => ({ id: quiz.id, ...this.toImport(quiz) }));
  }

  toCreateDtoById(id: number): QuizCreateDTO | null {
    return this.getImportById(id)?.quiz ?? null;
  }

  getImportById(id: number): GuestQuizImport | null {
    const quiz = this.loadQuizzes().find((candidate) => candidate.id === id);
    return quiz ? this.toImport(quiz) : null;
  }

  private toRaw(quiz: StoredGuestQuiz): QuizRawDTO {
    return {
      id: quiz.id,
      title: quiz.title,
      questionCount: quiz.questions.length,
      limits: quiz.limits ?? null,
    };
  }

  private toLocalQuiz(dto: QuizCreateDTO, rankingVersionId: string | null): StoredGuestQuiz {
    const quizId = this.nextLocalId();
    let nextQuestionId = quizId * 1000;
    let nextAnswerId = quizId * 100000;

    return {
      id: quizId,
      title: dto.title,
      scoring: normalizeQuizScoring(dto.scoring),
      limits: normalizeQuizLimits(dto.limits),
      rankingVersionId,
      questions: dto.questions.map((question) => ({
        id: nextQuestionId--,
        content: question.content,
        image: question.image ?? null,
        answers: question.answers.map((answer) => ({
          id: nextAnswerId--,
          content: answer.content,
          correct: answer.correct,
          points: typeof answer.points === 'number' && Number.isFinite(answer.points) ? answer.points : null,
        })),
      })),
    };
  }

  private toImport(quiz: StoredGuestQuiz): GuestQuizImport {
    return {
      quiz: this.toCreateDto(quiz),
      rankingVersionId: typeof quiz.rankingVersionId === 'string' ? quiz.rankingVersionId : null,
    };
  }

  private toCreateDto(quiz: StoredGuestQuiz): QuizCreateDTO {
    return {
      title: quiz.title,
      scoring: normalizeQuizScoring(quiz.scoring),
      limits: normalizeQuizLimits(quiz.limits),
      questions: quiz.questions.map((question) => ({
        content: question.content,
        image: question.image ?? null,
        answers: question.answers.map((answer) => ({
          content: answer.content,
          correct: answer.correct,
          points: typeof answer.points === 'number' && Number.isFinite(answer.points) ? answer.points : null,
        })),
      })),
    };
  }

  private nextLocalId(): number {
    const ids = this.loadQuizzes().map((quiz) => quiz.id);
    return Math.min(-1, ...ids) - 1;
  }

  private loadQuizzes(): StoredGuestQuiz[] {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as StoredGuestQuiz[];
      return Array.isArray(parsed) ? parsed.filter((quiz) => quiz.id < 0) : [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }

  private saveQuizzes(quizzes: StoredGuestQuiz[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        throw new QuizUserError(
          'Brakuje miejsca w pamięci przeglądarki na ten quiz (obrazy zajmują dużo miejsca). Zaloguj się, żeby zapisać go na koncie, albo usuń część lokalnych quizów.',
        );
      }
      throw error;
    }
  }
}
