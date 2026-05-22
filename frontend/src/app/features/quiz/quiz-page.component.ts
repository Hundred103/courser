import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AnswerPlayDTO } from '../../core/models/answer.model';
import { QuestionPlayDTO } from '../../core/models/question.model';
import { QuizPlayDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';



type QuizState =
  | { status: 'loading'; quiz: null; errorMessage: '' }
  | { status: 'ready'; quiz: QuizPlayDTO; errorMessage: '' }
  | { status: 'error'; quiz: null; errorMessage: string };

@Component({
  selector: 'app-quiz-page',
  standalone: true,
  templateUrl: './quiz-page.component.html',
  styleUrl: './quiz-page.component.css',
})
export class QuizPageComponent {
  private readonly quizApiService = inject(QuizApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private currentQuizId: number | null = null;
  private exitDecision: ((canLeave: boolean) => void) | null = null;
  private exitDecisionPromise: Promise<boolean> | null = null;

  private readonly quizState = toSignal(
    this.route.paramMap.pipe(
      map((params) => Number(params.get('id'))),
      switchMap((quizId) => {
        if (!quizId) {
          return of({
            status: 'error',
            quiz: null,
            errorMessage: 'Niepoprawny identyfikator quizu.',
          } satisfies QuizState);
        }
        return this.quizApiService.getQuizById(quizId).pipe(
          map((quiz): QuizState => ({
            status: 'ready',
            quiz,
            errorMessage: '',
          })),
          startWith({
            status: 'loading',
            quiz: null,
            errorMessage: '',
          } satisfies QuizState),
          catchError(() =>
            of({
              status: 'error',
              quiz: null,
              errorMessage: 'Nie udalo sie pobrac quizu.',
            } satisfies QuizState),
          ),
        );
      }),
    ),
    {
      initialValue: {
        status: 'loading',
        quiz: null,
        errorMessage: '',
      } satisfies QuizState,
    },
  );

  readonly selectedAnswers = signal<Record<number, number>>({});
  readonly submittedAnswers = signal<Record<number, number>>({});
  readonly checkedQuestions = signal<ReadonlySet<number>>(new Set());
  readonly currentIndex = signal(0);
  readonly resultReady = signal(false);
  readonly showIncompleteConfirm = signal(false);
  readonly showExitConfirm = signal(false);
  readonly activeSelectedQuestionId = signal<number | null>(null);
  readonly quiz = computed(() => this.quizState().quiz);
  readonly isLoading = computed(() => this.quizState().status === 'loading');
  readonly errorMessage = computed(() => this.quizState().errorMessage);
  readonly questions = computed(() => this.quiz()?.questions ?? []);
  readonly totalQuestions = computed(() => this.questions().length);
  readonly currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  readonly currentQuestionNumber = computed(() => this.currentIndex() + 1);
  readonly canGoPrevious = computed(() => this.currentIndex() > 0);
  readonly canGoNext = computed(() => this.currentIndex() < this.totalQuestions() - 1);
  readonly isLastQuestion = computed(() => this.currentIndex() === this.totalQuestions() - 1);
  readonly checkButtonLabel = computed(() => (this.isLastQuestion() ? 'Sprawdź i zakończ' : 'Sprawdz'));
  readonly hasUnansweredQuestions = computed(() => {
    const currentQuestionId = this.currentQuestion()?.id;
    const checkedQuestions = this.checkedQuestions();
    return this.questions().some((question) => question.id !== currentQuestionId && !checkedQuestions.has(question.id));
  });
  readonly currentQuestionChecked = computed(() => {
    const question = this.currentQuestion();
    return !!question && this.checkedQuestions().has(question.id);
  });
  readonly canCheckCurrentQuestion = computed(() => {
    const question = this.currentQuestion();
    return (
      !!question &&
      !this.resultReady() &&
      this.selectedAnswers()[question.id] !== undefined &&
      !this.currentQuestionChecked()
    );
  });
  readonly score = computed(() => {
    const submittedAnswers = this.submittedAnswers();

    return this.questions().reduce((correctAnswers, question) => {
      const selectedAnswerId = submittedAnswers[question.id];
      const selected = question.answers.find((answer) => answer.id === selectedAnswerId);
      return selected?.correct ? correctAnswers + 1 : correctAnswers;
    }, 0);
  });
  readonly scorePercent = computed(() => {
    const total = this.totalQuestions();
    return total === 0 ? 0 : Math.round((this.score() / total) * 100);
  });

  constructor() {
    effect(() => {
      const quizId = this.quiz()?.id ?? null;
      if (quizId !== this.currentQuizId) {
        this.currentQuizId = quizId;
        this.selectedAnswers.set({});
        this.submittedAnswers.set({});
        this.checkedQuestions.set(new Set());
        this.currentIndex.set(0);
        this.resultReady.set(false);
        this.showIncompleteConfirm.set(false);
        this.showExitConfirm.set(false);
        this.activeSelectedQuestionId.set(null);
      }
    });
  }

  selectAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): void {
    if (this.checkedQuestions().has(question.id) || this.resultReady()) {
      return;
    }

    this.selectedAnswers.update((answers) => ({
      ...answers,
      [question.id]: answer.id,
    }));
    this.activeSelectedQuestionId.set(question.id);
    this.showIncompleteConfirm.set(false);
    this.showExitConfirm.set(false);
  }

  checkCurrentQuestion(): void {
    const question = this.currentQuestion();

    if (!question || !this.canCheckCurrentQuestion()) {
      return;
    }

    if (this.isLastQuestion() && this.hasUnansweredQuestions()) {
      this.showIncompleteConfirm.set(true);
      return;
    }

    this.finishCurrentQuestionCheck(question);
  }

  confirmFinishQuiz(): void {
    const question = this.currentQuestion();

    if (!question || !this.canCheckCurrentQuestion()) {
      return;
    }

    this.showIncompleteConfirm.set(false);
    this.finishCurrentQuestionCheck(question);
  }

  cancelFinishQuiz(): void {
    this.showIncompleteConfirm.set(false);
  }

  requestExitQuiz(): void {
    this.goBack();
  }

  cancelExitQuiz(): void {
    this.showExitConfirm.set(false);
    this.resolveExitDecision(false);
  }

  confirmExitQuiz(): void {
    this.showExitConfirm.set(false);
    this.resolveExitDecision(true);
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.resultReady()) {
      return true;
    }

    this.showExitConfirm.set(true);

    if (!this.exitDecisionPromise) {
      this.exitDecisionPromise = new Promise<boolean>((resolve) => {
        this.exitDecision = resolve;
      });
    }

    return this.exitDecisionPromise;
  }

  private finishCurrentQuestionCheck(question: QuestionPlayDTO): void {
    const selectedAnswerId = this.selectedAnswers()[question.id];

    if (selectedAnswerId === undefined) {
      return;
    }

    this.submittedAnswers.update((answers) => ({
      ...answers,
      [question.id]: selectedAnswerId,
    }));

    this.checkedQuestions.update((checkedQuestions) => {
      const next = new Set(checkedQuestions);
      next.add(question.id);
      return next;
    });

    if (!this.canGoNext()) {
      this.resultReady.set(true);
    }
  }

  private resolveExitDecision(canLeave: boolean): void {
    this.exitDecision?.(canLeave);
    this.exitDecision = null;
    this.exitDecisionPromise = null;
  }

  goPrevious(): void {
    if (this.canGoPrevious()) {
      this.showIncompleteConfirm.set(false);
      this.showExitConfirm.set(false);
      this.clearPendingSelectionForCurrentQuestion();
      this.activeSelectedQuestionId.set(null);
      this.currentIndex.update((index) => index - 1);
    }
  }

  goNext(): void {
    if (this.canGoNext()) {
      this.showIncompleteConfirm.set(false);
      this.showExitConfirm.set(false);
      this.clearPendingSelectionForCurrentQuestion();
      this.activeSelectedQuestionId.set(null);
      this.currentIndex.update((index) => index + 1);
    }
  }

  answerClass(question: QuestionPlayDTO, answer: AnswerPlayDTO): string {
    const selectedAnswerId = this.selectedAnswers()[question.id];
    const isChecked = this.checkedQuestions().has(question.id);

    if (!this.resultReady() && !isChecked) {
      if (this.activeSelectedQuestionId() !== question.id) {
        return '';
      }

      return selectedAnswerId === answer.id ? 'selected' : '';
    }

    return '';
  }

  isCorrectAnswerVisible(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return answer.correct && (this.resultReady() || this.checkedQuestions().has(question.id));
  }

  isSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return this.submittedAnswers()[question.id] === answer.id;
  }

  isWrongSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return this.isSubmittedAnswer(question, answer) && !answer.correct;
  }

  goBack(): void {
    this.router.navigateByUrl('/');
  }

  private clearPendingSelectionForCurrentQuestion(): void {
    const question = this.currentQuestion();

    if (!question || this.checkedQuestions().has(question.id)) {
      return;
    }

    this.selectedAnswers.update((answers) => {
      const next = { ...answers };
      delete next[question.id];
      return next;
    });
  }
}
