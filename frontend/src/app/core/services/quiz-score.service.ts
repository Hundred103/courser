import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { BestQuizScore, SaveQuizResultRequest } from '../models/quiz-score.model';
import { environment } from '../../../environment';

@Injectable({
  providedIn: 'root',
})
export class QuizScoreService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  private readonly refreshTick = signal(0);
  readonly scoresVersion = this.refreshTick.asReadonly();

  saveQuizResult(userId: number, request: SaveQuizResultRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${userId}/quiz-results`, request).pipe(
      tap(() => this.requestRefresh()),
    );
  }

  getBestScores(userId: number): Observable<BestQuizScore[]> {
    return this.http.get<BestQuizScore[]>(`${this.apiUrl}/${userId}/quiz-results/best`);
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
