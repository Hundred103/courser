import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BestQuizScore } from '../models/quiz-score.model';
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
      tap(() => this.requestRefresh()),
    );
  }

  getDailyStatistics(): Observable<DailyStatistics[]> {
    return this.http.get<DailyStatistics[]>(`${this.apiUrl}/me/statistics/daily`);
  }

  getBestScores(): Observable<BestQuizScore[]> {
    return this.http.get<BestQuizScore[]>(`${this.apiUrl}/me/quiz-results/best`);
  }

  getCompletedAttemptsCount(quizId: number): Observable<number> {
    return this.http.get<number>(`${this.apiUrl}/me/quiz-attempts/count`, {
      params: { quizId },
    });
  }

  requestRefresh(): void {
    this.refreshTick.update((value) => value + 1);
  }

  toScaledScore(points: number): number {
    return Math.round(points * 100);
  }

  formatScoreValue(score: number, maxScore: number): string {
    const points = score / 100;
    const maxPoints = maxScore / 100;
    const roundedScore = Math.round(points * 100) / 100;

    if (Number.isInteger(roundedScore)) {
      return `${roundedScore}/${maxPoints}`;
    }

    const formatted = roundedScore.toFixed(2).replace(/0+$/, '').replace('.', ',');
    const formattedMax = Number.isInteger(maxPoints) ? maxPoints.toString() : maxPoints.toFixed(2).replace(/0+$/, '').replace('.', ',');
    return `${formatted}/${formattedMax}`;
  }
}

export interface CompleteQuizStatistics {
  requestId: string;
  quizId: number;
  checkedQuestions: number;
  studyMode: boolean;
  score: number | null;
  maxScore: number | null;
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
