import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, defer, from, merge, of, throwError } from 'rxjs';
import { catchError, concatMap, map, startWith, switchMap, tap, toArray } from 'rxjs/operators';
import { copyTitle, sendIfQuizFits } from '../utils/quiz-request.util';
import { QuizPlayDTO, QuizRawDTO, QuizCreateDTO, QuizEditTitleDTO, QuizShareCodePreviewDTO, RankingFinishDTO, RankingLeaderboardDTO } from '../models/quiz.model';
import { environment } from '../../../environment';
import { AuthService } from './auth.service';
import { GuestQuizStorageService } from './guest-quiz-storage.service';

export type QuizListState =
  | { status: 'loading'; quizzes: QuizRawDTO[] }
  | { status: 'ready'; quizzes: QuizRawDTO[] }
  | { status: 'error'; quizzes: QuizRawDTO[] };

@Injectable({
  providedIn: 'root',
})
export class QuizApiService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly guestQuizStorage = inject(GuestQuizStorageService);
  private readonly apiUrl = `${environment.apiUrl}/quizzes`;

  // List cached per user id; mutations patch signal; refresh doesn't refetch.
  private readonly listState = signal<QuizListState>({ status: 'loading', quizzes: [] });
  private readonly reloadList$ = new Subject<void>();
  readonly quizList = this.listState.asReadonly();

  constructor() {
    const userId = computed(() => this.authService.user()?.id ?? null);

    merge(
      toObservable(userId).pipe(map(() => true)),
      this.reloadList$.pipe(map(() => false)),
    ).pipe(
      switchMap((userChanged) => {
        const load$ = this.fetchQuizList().pipe(map((quizzes): QuizListState => ({ status: 'ready', quizzes })));
        return userChanged
          ? load$.pipe(
            startWith<QuizListState>({ status: 'loading', quizzes: [] }),
            catchError(() => of<QuizListState>({ status: 'error', quizzes: [] })),
          )
          : load$.pipe(catchError(() => EMPTY));
      }),
    ).subscribe((state) => this.listState.set(state));
  }

  reloadQuizList(): void {
    this.reloadList$.next();
  }

  getQuizById(id: number): Observable<QuizPlayDTO> {
    if (id < 0) {
      const quiz = this.guestQuizStorage.getById(id);
      return quiz ? of(quiz) : throwError(() => new Error('Local quiz not found'));
    }

    if (!this.authService.getCurrentUser()) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.get<QuizPlayDTO>(`${this.apiUrl}/${id}`);
  }

  deleteQuiz(id: number): Observable<void> {
    if (id < 0) {
      const epoch = this.authService.getSessionGeneration();
      this.guestQuizStorage.delete(id);
      this.withSession(epoch, () => this.removeFromList(id));
      return of(void 0);
    }

    if (!this.authService.getCurrentUser()) {
      return throwError(() => new Error('Login required'));
    }

    const epoch = this.authService.getSessionGeneration();
    return this.http.delete<void>(`${this.apiUrl}/${id}`).pipe(
      tap(() => this.withSession(epoch, () => this.removeFromList(id))),
    );
  }

  createQuiz(dto: QuizCreateDTO): Observable<QuizRawDTO> {
    if (!this.authService.getCurrentUser()) {
      return throwError(() => new Error('Login required'));
    }

    const epoch = this.authService.getSessionGeneration();
    return sendIfQuizFits(dto, () => this.http.post<QuizRawDTO>(this.apiUrl, dto)).pipe(
      tap((quiz) => this.withSession(epoch, () => this.addToList(quiz))),
    );
  }

  importQuiz(dto: QuizCreateDTO, rankingVersionId: string | null = null): Observable<QuizRawDTO> {
    if (!this.authService.getCurrentUser()) {
      const epoch = this.authService.getSessionGeneration();
      return defer(() => of(this.guestQuizStorage.create(dto, rankingVersionId))).pipe(
        tap((quiz) => this.withSession(epoch, () => this.addToList(quiz))),
      );
    }

    return this.createQuiz(dto);
  }

  importArchiveQuiz(dto: QuizCreateDTO, rankingVersionId: string | null): Observable<QuizRawDTO> {
    if (!this.authService.getCurrentUser()) return this.importQuiz(dto, rankingVersionId);
    const epoch = this.authService.getSessionGeneration();
    const body = { quiz: dto, rankingVersionId };
    return sendIfQuizFits(body, () => this.http.post<QuizRawDTO>(`${this.apiUrl}/import-archive`, body)).pipe(
      tap((quiz) => this.withSession(epoch, () => this.addToList(quiz))),
    );
  }

  // Migrate guest imports sequentially; failed rows stay for retry.
  migrateGuestQuizzes(): Observable<void> {
    const guestQuizzes = this.guestQuizStorage.getAllImports();

    if (guestQuizzes.length === 0) {
      return of(void 0);
    }

    return from(guestQuizzes).pipe(
      concatMap(({ id, quiz, rankingVersionId }) =>
        this.http.post(`${this.apiUrl}/import-archive`, { quiz, rankingVersionId, migratingGuestQuiz: true }).pipe(
          tap(() => this.guestQuizStorage.delete(id)),
          map(() => true),
          catchError(() => of(false)),
        ),
      ),
      toArray(),
      tap(() => this.reloadQuizList()),
      switchMap((results) => results.every(Boolean) ? of(void 0) : throwError(() => new Error('Guest quiz upload failed'))),
    );
  }

  createShareCode(id: number, expiresInSeconds: number | null): Observable<QuizShareCodeDTO> {
    if (!this.authService.getCurrentUser() || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.post<QuizShareCodeDTO>(`${this.apiUrl}/${id}/share-codes`, { expiresInSeconds });
  }

  importQuizByCode(code: string): Observable<QuizRawDTO> {
    if (!this.authService.getCurrentUser()) {
      return this.http
        .post<QuizShareCodePreviewDTO>(`${this.apiUrl}/share-code-preview`, { code })
        .pipe(switchMap((preview) => this.importQuiz(preview.quiz, preview.rankingVersionId)));
    }

    const epoch = this.authService.getSessionGeneration();
    return this.http.post<QuizRawDTO>(`${this.apiUrl}/import-code`, { code }).pipe(
      tap((quiz) => this.withSession(epoch, () => this.addToList(quiz))),
    );
  }

  updateQuiz(id: number, dto: QuizCreateDTO): Observable<QuizRawDTO> {
    if (!this.authService.getCurrentUser() || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    const epoch = this.authService.getSessionGeneration();
    return sendIfQuizFits(dto, () => this.http.put<QuizRawDTO>(`${this.apiUrl}/${id}`, dto)).pipe(
      tap((quiz) => this.withSession(epoch, () => this.replaceInList(quiz))),
    );
  }

  updateQuizTitle(id: number, dto: QuizEditTitleDTO): Observable<QuizRawDTO> {
    if (!this.authService.getCurrentUser() || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    const epoch = this.authService.getSessionGeneration();
    return this.http.patch<QuizRawDTO>(`${this.apiUrl}/${id}`, dto).pipe(
      tap((quiz) => this.withSession(epoch, () => this.replaceInList(quiz))),
    );
  }

  // Guest = local clone; account = POST fork (images by key).
  copyQuiz(id: number): Observable<QuizRawDTO> {
    if (id < 0) {
      const epoch = this.authService.getSessionGeneration();
      return defer(() => {
        const dto = this.guestQuizStorage.toCreateDtoById(id);
        return dto ? of(this.guestQuizStorage.create({ ...dto, title: copyTitle(dto.title) })) : throwError(() => new Error('Local quiz not found'));
      }).pipe(tap((quiz) => this.withSession(epoch, () => this.addToList(quiz))));
    }

    if (!this.authService.getCurrentUser()) {
      return throwError(() => new Error('Login required'));
    }

    const epoch = this.authService.getSessionGeneration();
    return this.http.post<QuizRawDTO>(`${this.apiUrl}/${id}/fork`, null).pipe(
      tap((quiz) => this.withSession(epoch, () => this.addToList(quiz))),
    );
  }

  exportQuiz(id: number): Observable<Blob> {
    if (!this.authService.getCurrentUser() || id < 0) {
      return throwError(() => new Error('Login required'));
    }

    return this.http.get(`${this.apiUrl}/${id}/export`, { responseType: 'blob' });
  }

  startRankingAttempt(id: number, clientSessionId: string): Observable<{ attemptId: string; elapsedMs: number }> {
    return this.http.post<{ attemptId: string; elapsedMs: number }>(`${this.apiUrl}/${id}/ranking-attempts`, { clientSessionId });
  }

  finishRankingAttempt(id: number, attemptId: string, answers: { questionIndex: number; answerIndexes: number[] }[]): Observable<RankingFinishDTO> {
    const epoch = this.authService.getSessionGeneration();
    return this.http.post<RankingFinishDTO>(`${this.apiUrl}/${id}/ranking-attempts/${attemptId}/finish`, { answers }).pipe(
      tap((result) => this.withSession(epoch, () => this.updateInList(id, (quiz) => ({ ...quiz, rankingPosition: result.position })))),
    );
  }

  getRankingLeaderboard(id: number): Observable<RankingLeaderboardDTO> {
    return this.http.get<RankingLeaderboardDTO>(`${this.apiUrl}/${id}/ranking`);
  }

  private fetchQuizList(): Observable<QuizRawDTO[]> {
    if (!this.authService.getCurrentUser()) {
      return defer(() => of(this.guestQuizStorage.getAllRaw()));
    }

    return this.http.get<QuizRawDTO[]>(this.apiUrl);
  }

  private withSession(epoch: number, apply: () => void): void {
    if (this.authService.getSessionGeneration() === epoch) {
      apply();
    }
  }

  private addToList(quiz: QuizRawDTO): void {
    if (this.listState().status !== 'ready') {
      this.reloadQuizList();
      return;
    }
    this.listState.update((state) => ({ ...state, quizzes: [...state.quizzes, quiz] }));
  }

  private replaceInList(quiz: QuizRawDTO): void {
    this.updateInList(quiz.id, () => quiz);
  }

  private updateInList(id: number, update: (quiz: QuizRawDTO) => QuizRawDTO): void {
    this.listState.update((state) => ({
      ...state,
      quizzes: state.quizzes.map((quiz) => (quiz.id === id ? update(quiz) : quiz)),
    }));
  }

  private removeFromList(id: number): void {
    this.listState.update((state) => ({ ...state, quizzes: state.quizzes.filter((quiz) => quiz.id !== id) }));
  }
}

export interface QuizShareCodeDTO {
  code: string;
  expiresAt: string | null;
}
