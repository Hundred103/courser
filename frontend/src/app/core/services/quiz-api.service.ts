import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { QuizPlayDTO, QuizRawDTO, QuizCreateDTO, QuizEditTitleDTO } from '../models/quiz.model';
import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root',
})
export class QuizApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/quizzes`;

  // GET /quizzes -> lista quizow
  getAllQuizzes(): Observable<QuizRawDTO[]> {
    return this.http.get<QuizRawDTO[]>(this.apiUrl);
  }

  // GET /quizzes/{id} -> caly quiz z pytaniami i odpowiedziami
  getQuizById(id: number): Observable<QuizPlayDTO> {
    return this.http.get<QuizPlayDTO>(`${this.apiUrl}/${id}`);
  }

  // GET /quizzes/{id}/raw -> tylko quiz
  getRawQuiz(id: number): Observable<QuizRawDTO> {
    return this.http.get<QuizRawDTO>(`${this.apiUrl}/${id}/raw`);
  }

  // DELETE /quizzes/{id}
  deleteQuiz(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // POST /quizzes
  createQuiz(dto: QuizCreateDTO): Observable<QuizRawDTO> {
    return this.http.post<QuizRawDTO>(this.apiUrl, dto);
  }

  // PUT /quizzes/{id} -> zastapienie calego quizu z pytaniami i odpowiedziami
  updateQuiz(id: number, dto: QuizCreateDTO): Observable<QuizRawDTO> {
    return this.http.put<QuizRawDTO>(`${this.apiUrl}/${id}`, dto);
  }

  // PATCH /quizzes/{id} -> zmiana tylko tabeli quiz (obecnie tylko tytul)
  updateQuizTitle(id: number, dto: QuizEditTitleDTO): Observable<QuizRawDTO> {
    return this.http.patch<QuizRawDTO>(`${this.apiUrl}/${id}`, dto);
  }
}
