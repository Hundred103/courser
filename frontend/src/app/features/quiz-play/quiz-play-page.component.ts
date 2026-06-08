import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AnswerPlayDTO } from '../../core/models/answer.model';
import { QuestionPlayDTO } from '../../core/models/question.model';
import { QuizPlayDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { QuizScoreService } from '../../core/services/quiz-score.service';

type QuizState =
  | { status: 'loading'; quiz: null; errorMessage: '' }
  | { status: 'ready'; quiz: QuizPlayDTO; errorMessage: '' }
  | { status: 'error'; quiz: null; errorMessage: string };

@Component({
  selector: 'app-quiz-play-page',
  standalone: true,
  templateUrl: './quiz-play-page.component.html',
  styleUrl: './quiz-play-page.component.css',
})
export class QuizPlayPageComponent {
  private readonly quizApiService = inject(QuizApiService);
  private readonly authService = inject(AuthService);
  private readonly quizScoreService = inject(QuizScoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private currentQuizId: number | null = null;
  private currentRandomQuestions: boolean | null = null;
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
              errorMessage: 'Nie udało się pobrać quizu.',
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

  readonly selectedAnswers = signal<Record<number, number[]>>({});
  readonly submittedAnswers = signal<Record<number, number[]>>({});
  readonly checkedQuestions = signal<ReadonlySet<number>>(new Set());
  readonly questions = signal<QuestionPlayDTO[]>([]);
  readonly currentIndex = signal(0);
  readonly resultReady = signal(false);
  readonly resultSaved = signal(false);
  readonly resultSaveError = signal<string | null>(null);
  readonly showIncompleteConfirm = signal(false);
  readonly showExitConfirm = signal(false);
  readonly activeSelectedQuestionId = signal<number | null>(null);
  readonly randomQuestions = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('randomQuestions') === 'true')),
    { initialValue: false },
  );

  readonly quiz = computed(() => this.quizState().quiz);
  readonly isLoading = computed(() => this.quizState().status === 'loading');
  readonly errorMessage = computed(() => this.quizState().errorMessage);
  readonly totalQuestions = computed(() => this.questions().length);
  readonly currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  readonly currentQuestionNumber = computed(() => this.currentIndex() + 1);
  readonly canGoPrevious = computed(() => this.currentIndex() > 0);
  readonly canGoNext = computed(() => this.currentIndex() < this.totalQuestions() - 1);
  readonly isLastQuestion = computed(() => this.currentIndex() === this.totalQuestions() - 1);
  readonly checkButtonLabel = computed(() => (this.isLastQuestion() ? 'Sprawdź i zakończ' : 'Sprawdź'));
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly canLeaveQuiz = computed(() => this.resultReady() || this.checkedQuestions().size === 0);
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
      (this.selectedAnswers()[question.id]?.length ?? 0) > 0 &&
      !this.currentQuestionChecked()
    );
  });
  readonly score = computed(() => {
    const submittedAnswers = this.submittedAnswers();

    return this.questions().reduce(
      (totalScore, question) => totalScore + this.calculateQuestionScore(question, submittedAnswers[question.id] ?? []),
      0,
    );
  });
  readonly formattedScore = computed(() => this.formatScore(this.score()));
  readonly scorePercent = computed(() => {
    const total = this.totalQuestions();
    return total === 0 ? 0 : Math.round((this.score() / total) * 100);
  });

  constructor() {
    effect(() => {
      const quiz = this.quiz();
      const randomQuestions = this.randomQuestions();

      if (!quiz) {
        this.questions.set([]);
        this.currentQuizId = null;
        this.currentRandomQuestions = null;
        return;
      }

      if (quiz.id !== this.currentQuizId || randomQuestions !== this.currentRandomQuestions) {
        this.currentQuizId = quiz.id;
        this.currentRandomQuestions = randomQuestions;
        this.questions.set(this.prepareQuestions(quiz.questions, randomQuestions));
        this.resetQuizProgress();
      }
    });

    effect(() => {
      if (!this.resultReady() || this.resultSaved()) {
        return;
      }

      const user = this.authService.user();
      const quiz = this.quiz();

      if (!user || !quiz) {
        return;
      }

      const totalQuestions = this.totalQuestions();

      if (totalQuestions === 0) {
        return;
      }

      this.resultSaved.set(true);
      this.resultSaveError.set(null);

      this.quizScoreService
        .saveQuizResult(user.id, {
          quizId: quiz.id,
          score: this.quizScoreService.toScaledScore(this.score()),
          maxScore: totalQuestions * 100,
        })
        .subscribe({
          error: () => {
            this.resultSaved.set(false);
            this.resultSaveError.set('Nie udało się zapisać wyniku.');
          },
        });
    });
  }

  selectAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): void {
    if (this.checkedQuestions().has(question.id) || this.resultReady()) {
      return;
    }

    this.selectedAnswers.update((answers) => {
      const selectedAnswerIds = answers[question.id] ?? [];
      const isSelected = selectedAnswerIds.includes(answer.id);
      const nextSelectedAnswerIds = isSelected
        ? selectedAnswerIds.filter((answerId) => answerId !== answer.id)
        : [...selectedAnswerIds, answer.id];

      return {
        ...answers,
        [question.id]: nextSelectedAnswerIds,
      };
    });
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
    if (this.canLeaveQuiz()) {
      return true;
    }

    this.showExitConfirm.set(true);
    return this.getExitDecision();
  }

  private getExitDecision(): Promise<boolean> {
    if (!this.exitDecisionPromise) {
      this.exitDecisionPromise = new Promise<boolean>((resolve) => {
        this.exitDecision = resolve;
      });
    }

    return this.exitDecisionPromise;
  }

  private resetQuizProgress(): void {
    this.selectedAnswers.set({});
    this.submittedAnswers.set({});
    this.checkedQuestions.set(new Set());
    this.currentIndex.set(0);
    this.resultReady.set(false);
    this.resultSaved.set(false);
    this.resultSaveError.set(null);
    this.showIncompleteConfirm.set(false);
    this.showExitConfirm.set(false);
    this.activeSelectedQuestionId.set(null);
  }

  private prepareQuestions(questions: QuestionPlayDTO[], randomQuestions: boolean): QuestionPlayDTO[] {
    const questionsWithRandomAnswers = questions.map((question) => ({
      ...question,
      answers: this.shuffle(question.answers),
    }));

    return randomQuestions ? this.shuffle(questionsWithRandomAnswers) : questionsWithRandomAnswers;
  }

  private shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled;
  }

  private finishCurrentQuestionCheck(question: QuestionPlayDTO): void {
    const selectedAnswerIds = this.selectedAnswers()[question.id] ?? [];

    if (selectedAnswerIds.length === 0) {
      return;
    }

    this.submittedAnswers.update((answers) => ({
      ...answers,
      [question.id]: selectedAnswerIds,
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

  isSelectedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    const selectedAnswerIds = this.selectedAnswers()[question.id] ?? [];
    const isChecked = this.checkedQuestions().has(question.id);

    return (
      !this.resultReady() &&
      !isChecked &&
      this.activeSelectedQuestionId() === question.id &&
      selectedAnswerIds.includes(answer.id)
    );
  }

  isCorrectAnswerVisible(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return answer.correct && (this.resultReady() || this.checkedQuestions().has(question.id));
  }

  isSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return (this.submittedAnswers()[question.id] ?? []).includes(answer.id);
  }

  isWrongSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return this.isSubmittedAnswer(question, answer) && !answer.correct;
  }

  isCorrectSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return this.isSubmittedAnswer(question, answer) && answer.correct;
  }

  goBack(): void {
    this.router.navigateByUrl('/');
  }

  isQuestionChecked(question: QuestionPlayDTO): boolean {
    return this.checkedQuestions().has(question.id);
  }

  questionScoreText(question: QuestionPlayDTO): string {
    return `${this.formatScore(this.calculateQuestionScore(question, this.submittedAnswers()[question.id] ?? []))}/1`;
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

  private calculateQuestionScore(question: QuestionPlayDTO, selectedAnswerIds: number[]): number {
    const correctAnswers = question.answers.filter((answer) => answer.correct);
    const wrongAnswers = question.answers.filter((answer) => !answer.correct);
    const correctSelected = correctAnswers.filter((answer) => selectedAnswerIds.includes(answer.id)).length;
    const wrongSelected = wrongAnswers.filter((answer) => selectedAnswerIds.includes(answer.id)).length;
    const correctScore = correctAnswers.length === 0 ? 0 : correctSelected / correctAnswers.length;
    const wrongPenalty = wrongAnswers.length === 0 ? 0 : wrongSelected / wrongAnswers.length;

    return Math.max(0, Math.min(1, correctScore - wrongPenalty));
  }

  private formatScore(score: number): string {
    const roundedScore = Math.round(score * 100) / 100;

    if (Number.isInteger(roundedScore)) {
      return roundedScore.toString();
    }

    return roundedScore.toFixed(2).replace(/0+$/, '').replace('.', ',');
  }
}
