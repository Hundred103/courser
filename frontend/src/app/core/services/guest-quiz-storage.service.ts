import { Injectable } from '@angular/core';
import { QuizCreateDTO, QuizPlayDTO, QuizRawDTO } from '../models/quiz.model';

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
      questions: dto.questions.map((question) => ({
        id: nextQuestionId--,
        content: question.content,
        answers: question.answers.map((answer) => ({
          id: nextAnswerId--,
          content: answer.content,
          correct: answer.correct,
        })),
      })),
    };
  }

  private toCreateDto(quiz: QuizPlayDTO): QuizCreateDTO {
    return {
      title: quiz.title,
      questions: quiz.questions.map((question) => ({
        content: question.content,
        answers: question.answers.map((answer) => ({
          content: answer.content,
          correct: answer.correct,
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
