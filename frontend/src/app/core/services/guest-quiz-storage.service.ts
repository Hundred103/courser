import { Injectable } from '@angular/core';
import { QuizCreateDTO, QuizPlayDTO, QuizRawDTO } from '../models/quiz.model';
import { normalizeQuizLimits } from '../models/quiz-limits.model';
import { normalizeQuizScoring } from '../utils/quiz-scoring.util';

const STORAGE_KEY = 'guestQuizzes';

@Injectable({
  providedIn: 'root',
})
export class GuestQuizStorageService {
  getAllRaw(): QuizRawDTO[] {
    return this.loadQuizzes().map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
    }));
  }

  getById(id: number): QuizPlayDTO | null {
    return this.loadQuizzes().find((quiz) => quiz.id === id) ?? null;
  }

  create(dto: QuizCreateDTO): QuizRawDTO {
    const quizzes = this.loadQuizzes();
    const quiz = this.toLocalQuiz(dto);
    this.saveQuizzes([...quizzes, quiz]);

    return {
      id: quiz.id,
      title: quiz.title,
    };
  }

  delete(id: number): void {
    this.saveQuizzes(this.loadQuizzes().filter((quiz) => quiz.id !== id));
  }

  getAllCreateDtos(): QuizCreateDTO[] {
    return this.loadQuizzes().map((quiz) => this.toCreateDto(quiz));
  }

  toCreateDtoById(id: number): QuizCreateDTO | null {
    const quiz = this.getById(id);
    return quiz ? this.toCreateDto(quiz) : null;
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  private toLocalQuiz(dto: QuizCreateDTO): QuizPlayDTO {
    const quizId = this.nextLocalId();
    let nextQuestionId = quizId * 1000;
    let nextAnswerId = quizId * 100000;

    return {
      id: quizId,
      title: dto.title,
      scoring: normalizeQuizScoring(dto.scoring),
      limits: normalizeQuizLimits(dto.limits),
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

  private toCreateDto(quiz: QuizPlayDTO): QuizCreateDTO {
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

  private loadQuizzes(): QuizPlayDTO[] {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as QuizPlayDTO[];
      return Array.isArray(parsed) ? parsed.filter((quiz) => quiz.id < 0) : [];
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
  }

  private saveQuizzes(quizzes: QuizPlayDTO[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizzes));
  }
}
