import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { QuizPlayDTO, QuizRawDTO } from '../models/quiz.model';

const API_BASE = '/api';

@Injectable({
  providedIn: 'root',
})
export class QuizApiService {
  private readonly http = inject(HttpClient);

  getAllQuizzes() {
    return this.http.get<QuizRawDTO[]>(`${API_BASE}/quizzes`);
  }

  getQuizById(quizId: number) {
    return this.http.get<QuizPlayDTO>(`${API_BASE}/quizzes/${quizId}`);
  }
}
