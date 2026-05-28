import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, finalize, map, of, startWith } from 'rxjs';
import { QuizRawDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';

type QuizSidebarState =
  | { status: 'loading'; quizzes: QuizRawDTO[]; errorMessage: '' }
  | { status: 'ready'; quizzes: QuizRawDTO[]; errorMessage: '' }
  | { status: 'error'; quizzes: QuizRawDTO[]; errorMessage: string };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  private readonly quizApiService = inject(QuizApiService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @ViewChild('titleInput') private titleInput?: ElementRef<HTMLInputElement>;

  private readonly quizState = toSignal(
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
          errorMessage: 'Nie udalo sie pobrac listy quizow.',
        } satisfies QuizSidebarState),
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

  readonly quizzes = computed(() => this.localQuizzes());
  readonly isLoading = computed(() => this.quizState().status === 'loading');
  readonly errorMessage = computed(() => this.quizState().errorMessage);
  readonly hasQuizzes = computed(() => this.quizzes().length > 0);
  readonly openMenuQuizId = signal<number | null>(null);
  readonly editingQuizId = signal<number | null>(null);
  readonly draftTitle = signal('');
  readonly busyQuizId = signal<number | null>(null);
  readonly quizPendingDelete = signal<QuizRawDTO | null>(null);
  readonly quizPendingStart = signal<QuizRawDTO | null>(null);
  readonly randomQuestionsEnabled = signal(false);

  constructor() {
    effect(() => {
      const state = this.quizState();

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

  startRename(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);
    this.editingQuizId.set(quiz.id);
    this.draftTitle.set(quiz.title);

    setTimeout(() => {
      const input = this.titleInput?.nativeElement;
      input?.focus();
      input?.select();
    });
  }

  updateDraftTitle(event: Event): void {
    this.draftTitle.set((event.target as HTMLInputElement).value);
  }

  cancelRename(): void {
    this.editingQuizId.set(null);
    this.draftTitle.set('');
  }

  saveRename(quiz: QuizRawDTO): void {
    const nextTitle = this.draftTitle().trim();

    if (!nextTitle || nextTitle === quiz.title || this.busyQuizId() === quiz.id) {
      this.cancelRename();
      return;
    }

    const previousTitle = quiz.title;

    this.busyQuizId.set(quiz.id);
    this.localQuizzes.update((quizzes) =>
      quizzes.map((currentQuiz) => (currentQuiz.id === quiz.id ? { ...currentQuiz, title: nextTitle } : currentQuiz)),
    );
    this.cancelRename();

    this.quizApiService
      .updateQuizTitle(quiz.id, { title: nextTitle })
      .pipe(finalize(() => this.busyQuizId.set(null)))
      .subscribe({
        next: (updatedQuiz) => {
          this.localQuizzes.update((quizzes) =>
            quizzes.map((currentQuiz) => (currentQuiz.id === updatedQuiz.id ? updatedQuiz : currentQuiz)),
          );
        },
        error: () => {
          this.localQuizzes.update((quizzes) =>
            quizzes.map((currentQuiz) =>
              currentQuiz.id === quiz.id ? { ...currentQuiz, title: previousTitle } : currentQuiz,
            ),
          );
        },
      });
  }

  requestDeleteQuiz(quiz: QuizRawDTO): void {
    this.openMenuQuizId.set(null);
    this.quizPendingDelete.set(quiz);
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
    void this.router.navigate(['/quiz', quiz.id], { queryParams });
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

          if (this.router.url === `/quiz/${quiz.id}`) {
            void this.router.navigate(['/']);
          }
        },
      });
  }
}
