import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root',
})
export class QuizScoreService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  private readonly refreshTick = signal(0);
  readonly scoresVersion = this.refreshTick.asReadonly();

  completeQuiz(request: CompleteQuizStatistics): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/me/statistics/completions`, request).pipe(
      tap(() => this.refreshTick.update((value) => value + 1)),
    );
  }

  getDailyStatistics(): Observable<DailyStatistics[]> {
    return this.http.get<DailyStatistics[]>(`${this.apiUrl}/me/statistics/daily`);
  }

  getCompletedAttemptsCount(quizId: number): Observable<number> {
    return this.http.get<number>(`${this.apiUrl}/me/quiz-attempts/count`, {
      params: { quizId },
    });
  }
}

export interface CompleteQuizStatistics {
  requestId: string;
  quizId: number;
  checkedQuestions: number;
  studyMode: boolean;
  effectivenessHundredths: number | null;
  timeZone: string;
}

export interface DailyStatistics {
  date: string;
  completedQuizzes: number;
  checkedQuestions: number;
  effectivenessSum: number;
  effectivenessCount: number;
}
