import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { QuizPlayDTO, QuizRawDTO, QuizCreateDTO, QuizEditTitleDTO } from '../models/quiz.model';
import { environment } from '../../../environment';



@Injectable({
  providedIn: 'root',
})
export class QuizApiService {
  private readonly http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/quizzes`;

  //GET /quizzes -> lista quizow
  getAllQuizzes() {
    return this.http.get<QuizRawDTO[]>(this.apiUrl);
  }

  //GET /quizzes/{id} -> caly quiz z pytaniami i odpowiedziami
  getQuizById(id: number) {
    return this.http.get<QuizPlayDTO>(`${this.apiUrl}/${id}`);
  }

  //GET /quizzes/{id}/raw -> tylko quiz
  getRawQuiz(id: number) {
    return this.http.get<QuizRawDTO>(`${this.apiUrl}/${id}/raw`);
  }

  //DELETE /quizzes/{id}
  deleteQuiz(id: number) {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  //POST /quizzes
  createQuiz(dto: QuizCreateDTO) {
    return this.http.post<QuizRawDTO>(this.apiUrl, dto);
  }

  //PUT /quizzes/{id} -> zastapienie calego quizu z pytaniami i odpowiedziami
  updateQuiz(id: number, dto: QuizCreateDTO) {
    return this.http.put<QuizRawDTO>(`${this.apiUrl}/${id}`, dto);
  }

  //PATCH /quizzes/{id} -> zmiana tylko tabeli quiz (obecnie tylko tytul)
  updateQuizTitle(id: number, dto: QuizEditTitleDTO) {
    return this.http.patch<QuizRawDTO>(`${this.apiUrl}/${id}`, dto);
  }
}
