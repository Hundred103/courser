import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { QuizRawDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { GuestQuizStorageService } from '../../core/services/guest-quiz-storage.service';
import { QuizScoreService } from '../../core/services/quiz-score.service';
import { buildQuizZip } from '../../core/utils/quiz-zip.util';
import { quizRequestErrorMessage } from '../../core/utils/quiz-request.util';
import { normalizeQuizLimits } from '../../core/models/quiz-limits.model';

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

  readonly quizzes = computed(() => this.quizApiService.quizList().quizzes);
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly isLoading = computed(() => this.quizApiService.quizList().status === 'loading');
  readonly errorMessage = computed(() => this.quizApiService.quizList().status === 'error' ? 'Nie udało się pobrać listy quizów.' : '');
  readonly hasQuizzes = computed(() => this.quizzes().length > 0);
  readonly openMenuQuizId = signal<number | null>(null);
  readonly editingQuizId = signal<number | null>(null);
  readonly draftTitle = signal('');
  readonly renameError = signal('');
  readonly busyQuizId = signal<number | null>(null);
  readonly quizPendingDelete = signal<QuizRawDTO | null>(null);
  readonly quizPendingStart = signal<QuizRawDTO | null>(null);
  readonly startQuizLoading = signal(false);
  readonly startRandomQuestionOrder = signal(false);
  readonly startStudyMode = signal(false);
  readonly completedAttemptsCount = signal<number | null>(null);
  readonly quizPendingShare = signal<QuizRawDTO | null>(null);
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

    if (!this.isLoggedIn()) {
      this.authPromptMessage.set('Żeby wyeksportować quiz, musisz się zalogować.');
      return;
    }

    if (quiz.id < 0) {
      void this.exportGuestQuiz(quiz);
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
    const guestQuiz = this.guestQuizStorage.getImportById(quiz.id);

    if (!guestQuiz) {
      return;
    }

    const blob = await buildQuizZip(guestQuiz.quiz, { rankingVersionId: guestQuiz.rankingVersionId });

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

  copyQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);

    if (this.busyQuizId() === quiz.id) {
      return;
    }

    if (quiz.id > 0 && !this.isLoggedIn()) {
      this.authPromptMessage.set('Żeby utworzyć kopię quizu, musisz się zalogować.');
      return;
    }

    this.busyQuizId.set(quiz.id);
    this.quizApiService
      .copyQuiz(quiz.id)
      .pipe(finalize(() => this.busyQuizId.set(null)))
      .subscribe({
        error: (error) => this.authPromptMessage.set(quizRequestErrorMessage(error, 'Nie udało się utworzyć kopii quizu.')),
      });
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
        next: () => this.cancelRename(),
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

  rankingPositionLabel(quiz: QuizRawDTO): string | null {
    const position = quiz.rankingPosition;
    if (!position) return null;
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    return position === 4 ? 'Czwarte miejsce' : 'Piąte miejsce';
  }

  isMedalPosition(quiz: QuizRawDTO): boolean {
    return !!quiz.rankingPosition && quiz.rankingPosition <= 3;
  }

  requestStartQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);

    if (this.startQuizLoading()) {
      return;
    }

    this.startQuizLoading.set(true);

    const completedAttemptsCount = this.isLoggedIn() && quiz.id > 0
      ? this.quizScoreService.getCompletedAttemptsCount(quiz.id).pipe(catchError(() => of(null)))
      : of(null);

    completedAttemptsCount
      .pipe(finalize(() => this.startQuizLoading.set(false)))
      .subscribe((attempts) => {
        this.quizPendingStart.set(quiz);
        this.startRandomQuestionOrder.set(normalizeQuizLimits(quiz.limits).randomQuestionOrder);
        this.startStudyMode.set(false);
        this.completedAttemptsCount.set(attempts);
      });
  }

  cancelStartQuiz(): void {
    this.quizPendingStart.set(null);
    this.completedAttemptsCount.set(null);
  }

  startQuiz(): void {
    const quiz = this.quizPendingStart();

    if (!quiz) {
      return;
    }

    this.quizPendingStart.set(null);
    this.completedAttemptsCount.set(null);
    void this.router.navigate(['/quizzes', quiz.id, 'play'], {
      queryParams: {
        randomQuestionOrder: this.startRandomQuestionOrder(),
        studyMode: this.startStudyMode(),
        playSession: this.newPlaySessionId(),
      },
    });
  }

  private newPlaySessionId(): string {
    return crypto.randomUUID();
  }

  updateStartRandomQuestionOrder(event: Event): void {
    this.startRandomQuestionOrder.set((event.target as HTMLInputElement).checked);
  }

  updateStartStudyMode(event: Event): void {
    this.startStudyMode.set((event.target as HTMLInputElement).checked);
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
          this.quizPendingDelete.set(null);

          if (this.router.url.startsWith(`/quizzes/${quiz.id}/play`) || this.router.url.startsWith(`/quizzes/${quiz.id}/edit`)) {
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
