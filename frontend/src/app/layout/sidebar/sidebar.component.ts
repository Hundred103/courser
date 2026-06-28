import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, finalize, map, of, startWith, switchMap } from 'rxjs';
import { BestQuizScore } from '../../core/models/quiz-score.model';
import { QuizRawDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { GuestQuizStorageService } from '../../core/services/guest-quiz-storage.service';
import { QuizScoreService } from '../../core/services/quiz-score.service';
import { buildQuizZip } from '../../core/utils/quiz-zip.util';

type QuizSidebarState =
  | { status: 'loading'; quizzes: QuizRawDTO[]; errorMessage: '' }
  | { status: 'ready'; quizzes: QuizRawDTO[]; errorMessage: '' }
  | { status: 'error'; quizzes: QuizRawDTO[]; errorMessage: string };

type BestScoresState =
  | { status: 'guest'; scores: BestQuizScore[] }
  | { status: 'loading'; scores: BestQuizScore[] }
  | { status: 'ready'; scores: BestQuizScore[] }
  | { status: 'error'; scores: BestQuizScore[] };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  private readonly quizApiService = inject(QuizApiService);
  private readonly guestQuizStorage = inject(GuestQuizStorageService);
  private readonly authService = inject(AuthService);
  private readonly quizScoreService = inject(QuizScoreService);
  private readonly router = inject(Router);

  @ViewChild('titleInput') private titleInput?: ElementRef<HTMLInputElement>;

  private readonly quizState = toSignal(
    toObservable(this.authService.user).pipe(
      switchMap(() =>
        this.quizApiService.getAllQuizzes().pipe(
          map((quizzes): QuizSidebarState => ({
            status: 'ready',
            quizzes,
            errorMessage: '',
          })),
          startWith({
            status: 'loading',
            quizzes: [],
            errorMessage: '',
          } satisfies QuizSidebarState),
          catchError(() =>
            of({
              status: 'error',
              quizzes: [],
              errorMessage: 'Nie udało się pobrać listy quizów.',
            } satisfies QuizSidebarState),
          ),
        ),
      ),
    ),
    {
      initialValue: {
        status: 'loading',
        quizzes: [],
        errorMessage: '',
      } satisfies QuizSidebarState,
    },
  );

  private readonly localQuizzes = signal<QuizRawDTO[]>([]);

  private readonly bestScoresState = toSignal(
    combineLatest([
      toObservable(this.authService.user),
      toObservable(this.quizScoreService.scoresVersion).pipe(startWith(0)),
    ]).pipe(
      switchMap(([user]) => {
        if (!user) {
          return of({ status: 'guest', scores: [] } satisfies BestScoresState);
        }

        return this.quizScoreService.getBestScores().pipe(
          map((scores) => ({ status: 'ready', scores } satisfies BestScoresState)),
          startWith({ status: 'loading', scores: [] } satisfies BestScoresState),
          catchError(() => of({ status: 'error', scores: [] } satisfies BestScoresState)),
        );
      }),
    ),
    {
      initialValue: { status: 'loading', scores: [] } satisfies BestScoresState,
    },
  );

  readonly quizzes = computed(() => this.localQuizzes());
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoading = computed(() => this.quizState().status === 'loading');
  readonly errorMessage = computed(() => this.quizState().errorMessage);
  readonly hasQuizzes = computed(() => this.quizzes().length > 0);
  readonly openMenuQuizId = signal<number | null>(null);
  readonly editingQuizId = signal<number | null>(null);
  readonly draftTitle = signal('');
  readonly renameError = signal('');
  readonly busyQuizId = signal<number | null>(null);
  readonly quizPendingDelete = signal<QuizRawDTO | null>(null);
  readonly quizPendingStart = signal<QuizRawDTO | null>(null);
  readonly quizPendingShare = signal<QuizRawDTO | null>(null);
  readonly randomQuestionsEnabled = signal(false);
  readonly authPromptMessage = signal<string | null>(null);
  readonly shareExpiresInSeconds = signal<number | null>(604800);
  readonly shareCode = signal('');
  readonly shareError = signal('');
  readonly shareCopied = signal(false);

  readonly shareExpirationOptions = [
    { label: '1 godzina', value: 3600 },
    { label: '24 godziny', value: 86400 },
    { label: '7 dni', value: 604800 },
    { label: '30 dni', value: 2592000 },
    { label: 'Na zawsze', value: null },
  ];

  private readonly bestScoresByQuizId = computed(() => {
    const scores = this.bestScoresState().scores;
    return new Map(scores.map((score) => [score.quizId, score]));
  });

  constructor() {
    effect(() => {
      const state = this.quizState();

      if (state.status === 'loading') {
        this.localQuizzes.set([]);
        return;
      }

      if (state.status === 'ready') {
        this.localQuizzes.set(state.quizzes);
      }
    });
  }

  @HostListener('document:click', ['$event'])
  closeMenuOnOutsideClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    if (!target.closest('.quiz-options')) {
      this.openMenuQuizId.set(null);
    }
  }

  toggleMenu(quizId: number, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuQuizId.update((currentQuizId) => (currentQuizId === quizId ? null : quizId));
  }

  requestCreateQuiz(): void {
    if (!this.isLoggedIn()) {
      this.authPromptMessage.set('Żeby utworzyć quiz, musisz się zalogować.');
      return;
    }

    void this.router.navigate(['/quizzes/new']);
  }

  startRename(quiz: QuizRawDTO): void {
    if (!this.isLoggedIn()) {
      this.openMenuQuizId.set(null);
      this.authPromptMessage.set('Żeby zmienić nazwę quizu, musisz się zalogować.');
      return;
    }

    this.openMenuQuizId.set(null);
    this.editingQuizId.set(quiz.id);
    this.draftTitle.set(quiz.title);
    this.renameError.set('');

    setTimeout(() => {
      const input = this.titleInput?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  editQuiz(quiz: QuizRawDTO): void {
    if (!this.isLoggedIn()) {
      this.openMenuQuizId.set(null);
      this.authPromptMessage.set('Żeby edytować quiz, musisz się zalogować.');
      return;
    }

    this.openMenuQuizId.set(null);
    void this.router.navigate(['/quizzes', quiz.id, 'edit']);
  }

  exportQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);

    if (quiz.id < 0) {
      void this.exportGuestQuiz(quiz);
      return;
    }

    if (!this.isLoggedIn()) {
      this.authPromptMessage.set('Żeby wyeksportować quiz, musisz się zalogować.');
      return;
    }

    if (this.busyQuizId() === quiz.id) {
      return;
    }

    this.busyQuizId.set(quiz.id);

    this.quizApiService
      .exportQuiz(quiz.id)
      .pipe(finalize(() => this.busyQuizId.set(null)))
      .subscribe({
        next: (blob) => this.downloadQuizZip(blob, quiz.title),
        error: () => {
          this.authPromptMessage.set('Nie udało się wyeksportować quizu.');
        },
      });
  }

  private async exportGuestQuiz(quiz: QuizRawDTO): Promise<void> {
    const fullQuiz = this.guestQuizStorage.getById(quiz.id);

    if (!fullQuiz) {
      return;
    }

    const blob = await buildQuizZip({
      title: fullQuiz.title,
      questions: fullQuiz.questions.map((question) => ({
        content: question.content,
        image: question.image ?? null,
        answers: question.answers.map((answer) => ({
          content: answer.content,
          correct: answer.correct,
        })),
      })),
    });

    this.downloadQuizZip(blob, quiz.title);
  }

  private downloadQuizZip(blob: Blob, title: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = title.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'quiz';

    link.href = url;
    link.download = `${safeTitle}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  }

  requestShareQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);

    if (!this.isLoggedIn() || quiz.id < 0) {
      this.authPromptMessage.set('Żeby udostępnić quiz, musisz się zalogować.');
      return;
    }

    this.quizPendingShare.set(quiz);
    this.shareExpiresInSeconds.set(604800);
    this.shareCode.set('');
    this.shareError.set('');
    this.shareCopied.set(false);
  }

  updateDraftTitle(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement).value);
  }

  cancelRename(): void {
    this.editingQuizId.set(null);
    this.draftTitle.set('');
    this.renameError.set('');
  }

  cancelRenameFromKeyboard(event: Event): void {
    event.preventDefault();
    this.cancelRename();
  }

  saveRenameFromKeyboard(quiz: QuizRawDTO, event: Event): void {
    event.preventDefault();
    this.saveRename(quiz, (event.target as HTMLInputElement).value);
  }

  saveRenameFromInput(quiz: QuizRawDTO, event: Event): void {
    this.saveRename(quiz, (event.target as HTMLInputElement).value);
  }

  private saveRename(quiz: QuizRawDTO, title: string): void {
    if (this.editingQuizId() !== quiz.id) {
      return;
    }

    const nextTitle = title.trim();

    if (this.busyQuizId() === quiz.id) {
      return;
    }

    if (!nextTitle || nextTitle === quiz.title) {
      this.cancelRename();
      return;
    }

    this.busyQuizId.set(quiz.id);
    this.renameError.set('');

    this.quizApiService
      .updateQuizTitle(quiz.id, { title: nextTitle })
      .pipe(finalize(() => this.busyQuizId.set(null)))
      .subscribe({
        next: (updatedQuiz) => {
          this.localQuizzes.update((quizzes) =>
            quizzes.map((currentQuiz) => (currentQuiz.id === updatedQuiz.id ? updatedQuiz : currentQuiz)),
          );
          this.cancelRename();
        },
        error: (error: unknown) => {
          this.renameError.set(this.renameErrorMessage(error));
        },
      });
  }

  private renameErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) {
        return 'Nie udało się zapisać nazwy. Ten quiz nie należy do aktualnie zalogowanego użytkownika.';
      }

      if (error.status === 400) {
        return 'Nie udało się zapisać nazwy. Odśwież stronę i zaloguj się ponownie.';
      }

      return `Nie udało się zapisać nazwy quizu. Kod błędu: ${error.status}.`;
    }

    return 'Nie udało się zapisać nazwy quizu.';
  }

  requestDeleteQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);
    this.quizPendingDelete.set(quiz);
  }

  setShareExpiration(value: number | null): void {
    if (this.shareCode()) {
      return;
    }

    this.shareExpiresInSeconds.set(value);
    this.shareCode.set('');
    this.shareError.set('');
    this.shareCopied.set(false);
  }

  cancelShareQuiz(): void {
    this.quizPendingShare.set(null);
    this.shareCode.set('');
    this.shareError.set('');
    this.shareCopied.set(false);
  }

  confirmShareQuiz(): void {
    const quiz = this.quizPendingShare();

    if (!quiz || this.busyQuizId() === quiz.id || this.shareCode()) {
      return;
    }

    this.busyQuizId.set(quiz.id);
    this.shareError.set('');
    this.shareCopied.set(false);

    this.quizApiService
      .createShareCode(quiz.id, this.shareExpiresInSeconds())
      .pipe(finalize(() => this.busyQuizId.set(null)))
      .subscribe({
        next: (shareCode) => {
          this.shareCode.set(shareCode.code);
        },
        error: () => {
          this.shareError.set('Nie udało się wygenerować kodu. Spróbuj ponownie.');
        },
      });
  }

  copyShareCode(): void {
    const code = this.shareCode();

    if (!code || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(code).then(() => {
      this.shareCopied.set(true);
    });
  }

  bestScoreLabel(quizId: number): string | null {
    const bestScore = this.bestScoresByQuizId().get(quizId);

    if (!bestScore) {
      return null;
    }

    return this.quizScoreService.formatScoreValue(bestScore.score, bestScore.maxScore);
  }

  requestStartQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);
    this.randomQuestionsEnabled.set(false);
    this.quizPendingStart.set(quiz);
  }

  updateRandomQuestions(event: Event): void {
    this.randomQuestionsEnabled.set((event.target as HTMLInputElement).checked);
  }

  cancelStartQuiz(): void {
    this.quizPendingStart.set(null);
    this.randomQuestionsEnabled.set(false);
  }

  startQuiz(): void {
    const quiz = this.quizPendingStart();

    if (!quiz) {
      return;
    }

    const queryParams = this.randomQuestionsEnabled() ? { randomQuestions: true } : undefined;
    this.quizPendingStart.set(null);
    this.randomQuestionsEnabled.set(false);
    void this.router.navigate(['/quizzes', quiz.id, 'play'], { queryParams });
  }

  cancelDeleteQuiz(): void {
    this.quizPendingDelete.set(null);
  }

  confirmDeleteQuiz(): void {
    const quiz = this.quizPendingDelete();

    if (!quiz) {
      return;
    }

    if (this.busyQuizId() === quiz.id) {
      return;
    }

    this.busyQuizId.set(quiz.id);
    this.quizApiService
      .deleteQuiz(quiz.id)
      .pipe(finalize(() => this.busyQuizId.set(null)))
      .subscribe({
        next: () => {
          this.localQuizzes.update((quizzes) => quizzes.filter((currentQuiz) => currentQuiz.id !== quiz.id));
          this.quizPendingDelete.set(null);

          if (this.router.url === `/quizzes/${quiz.id}/play` || this.router.url === `/quizzes/${quiz.id}/edit`) {
            void this.router.navigate(['/']);
          }
        },
      });
  }

  cancelAuthPrompt(): void {
    this.authPromptMessage.set(null);
  }

  goToLogin(): void {
    this.authPromptMessage.set(null);
    void this.router.navigate(['/login']);
  }
}
