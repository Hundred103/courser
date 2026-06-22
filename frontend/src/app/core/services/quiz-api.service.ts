import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { QuizPlayDTO, QuizRawDTO, QuizCreateDTO, QuizEditTitleDTO } from '../models/quiz.model';
import { environment } from '../../../environment';
import { AuthService } from './auth.service';
import { GuestQuizStorageService } from './guest-quiz-storage.service';

@Injectable({
  providedIn: 'root',
})
export class QuizApiService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly guestQuizStorage = inject(GuestQuizStorageService);
  private readonly apiUrl = `${environment.apiUrl}/quizzes`;

  // GET /quizzes -> lista quizow
  getAllQuizzes(): Observable<QuizRawDTO[]> {
    const user = this.authService.getCurrentUser();

    if (!user) {
      return of(this.guestQuizStorage.getAllRaw());
    }

    return this.http.get<QuizRawDTO[]>(this.apiUrl);
  }

  // GET /quizzes/{id} -> caly quiz z pytaniami i odpowiedziami
  getQuizById(id: number): Observable<QuizPlayDTO> {
    if (id < 0) {
      const quiz = this.guestQuizStorage.getById(id);
      return quiz ? of(quiz) : throwError(() => new Error('Local quiz not found'));
    }

    const user = this.authService.getCurrentUser();

    if (!user) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.get<QuizPlayDTO>(`${this.apiUrl}/${id}`);
  }

  // GET /quizzes/{id}/raw -> tylko quiz
  getRawQuiz(id: number): Observable<QuizRawDTO> {
    if (id < 0) {
      const quiz = this.guestQuizStorage.getById(id);
      return quiz ? of({ id: quiz.id, title: quiz.title }) : throwError(() => new Error('Local quiz not found'));
    }

    const user = this.authService.getCurrentUser();

    if (!user) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.get<QuizRawDTO>(`${this.apiUrl}/${id}/raw`);
  }

  // DELETE /quizzes/{id}
  deleteQuiz(id: number): Observable<void> {
    if (id < 0) {
      this.guestQuizStorage.delete(id);
      return of(void 0);
    }

    const user = this.authService.getCurrentUser();

    if (!user) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // POST /quizzes
  createQuiz(dto: QuizCreateDTO): Observable<QuizRawDTO> {
    const user = this.authService.getCurrentUser();

    if (!user) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.post<QuizRawDTO>(this.apiUrl, dto);
  }

  importQuiz(dto: QuizCreateDTO): Observable<QuizRawDTO> {
    const user = this.authService.getCurrentUser();

    if (!user) {
      return of(this.guestQuizStorage.create(dto));
    }

    return this.createQuiz(dto);
  }

  createShareCode(id: number, expiresInSeconds: number | null): Observable<QuizShareCodeDTO> {
    const user = this.authService.getCurrentUser();

    if (!user || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.post<QuizShareCodeDTO>(`${this.apiUrl}/${id}/share-codes`, { expiresInSeconds });
  }

  importQuizByCode(code: string): Observable<QuizRawDTO> {
    const user = this.authService.getCurrentUser();

    if (!user) {
      return this.http
        .post<QuizCreateDTO>(`${this.apiUrl}/share-code-preview`, { code })
        .pipe(switchMap((quiz) => this.importQuiz(quiz)));
    }

    return this.http.post<QuizRawDTO>(`${this.apiUrl}/import-code`, { code });
  }

  // PUT /quizzes/{id} -> zastapienie calego quizu z pytaniami i odpowiedziami
  updateQuiz(id: number, dto: QuizCreateDTO): Observable<QuizRawDTO> {
    const user = this.authService.getCurrentUser();

    if (!user || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.put<QuizRawDTO>(`${this.apiUrl}/${id}`, dto);
  }

  // PATCH /quizzes/{id} -> zmiana tylko tabeli quiz (obecnie tylko tytul)
  updateQuizTitle(id: number, dto: QuizEditTitleDTO): Observable<QuizRawDTO> {
    const user = this.authService.getCurrentUser();

    if (!user || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.patch<QuizRawDTO>(`${this.apiUrl}/${id}`, dto);
  }
}

export interface QuizShareCodeDTO {
  code: string;
  expiresAt: string | null;
}
