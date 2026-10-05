import { Component, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AnswerPlayDTO } from '../../core/models/answer.model';
import { limitsAreActive, normalizeQuizLimits } from '../../core/models/quiz-limits.model';
import { QuestionPlayDTO } from '../../core/models/question.model';
import { QuizPlayDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { AttemptStateResponse, QuizApiService } from '../../core/services/quiz-api.service';
import { QuizScoreService } from '../../core/services/quiz-score.service';
import { toImageSrc } from '../../core/utils/image-compression.util';
import { awardedQuestionScore, normalizeQuizScoring, questionMaxScore } from '../../core/utils/quiz-scoring.util';

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
export class QuizPlayPageComponent implements OnDestroy {
  private readonly quizApiService = inject(QuizApiService);
  private readonly authService = inject(AuthService);
  private readonly quizScoreService = inject(QuizScoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private currentQuizId: number | null = null;
  private currentRandomQuestions: boolean | null = null;
  private exitDecision: ((canLeave: boolean) => void) | null = null;
  private exitDecisionPromise: Promise<boolean> | null = null;
  private tickHandle: number | null = null;
  private pollHandle: number | null = null;
  private quizDeadlineLocal: number | null = null;
  private questionDeadlineLocal: number | null = null;
  private endingWarningMs = 10_000;
  private openingQuestionId: number | null = null;
  private submittingQuestionIds = new Set<number>();
  private quizAutoFinished = false;

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
  readonly attemptId = signal<number | null>(null);
  readonly playBlockMessage = signal<string | null>(null);
  readonly cheatingMessage = signal<string | null>(null);
  readonly quizRemainingMs = signal<number | null>(null);
  readonly questionRemainingMs = signal<number | null>(null);
  readonly quizEndingSoon = signal(false);
  readonly questionEndingSoon = signal(false);
  readonly showIncompleteConfirm = signal(false);
  readonly showExitConfirm = signal(false);
  readonly activeSelectedQuestionId = signal<number | null>(null);
  readonly showAnswerFeedback = computed(() => {
    const showCorrect = normalizeQuizLimits(this.quiz()?.limits).showCorrectAnswers;
    return showCorrect || this.resultReady();
  });

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
  readonly scoring = computed(() => normalizeQuizScoring(this.quiz()?.scoring));
  readonly score = computed(() => {
    const submittedAnswers = this.submittedAnswers();
    const scoring = this.scoring();

    return this.questions().reduce(
      (totalScore, question) =>
        totalScore + awardedQuestionScore(question.answers, submittedAnswers[question.id] ?? [], scoring),
      0,
    );
  });
  readonly maxScore = computed(() =>
    this.questions().reduce((total, question) => total + questionMaxScore(question.answers, this.scoring()), 0),
  );
  readonly formattedScore = computed(() => this.formatScore(this.score()));
  readonly formattedMaxScore = computed(() => this.formatScore(this.maxScore()));
  readonly formattedQuizTime = computed(() => this.formatDuration(this.quizRemainingMs()));
  readonly formattedQuestionTime = computed(() => this.formatDuration(this.questionRemainingMs()));
  readonly scorePercent = computed(() => {
    const maxScore = this.maxScore();
    return maxScore === 0 ? 0 : Math.round((this.score() / maxScore) * 100);
  });

  constructor() {
    effect(() => {
      const quiz = this.quiz();

      if (!quiz) {
        this.questions.set([]);
        this.currentQuizId = null;
        this.currentRandomQuestions = null;
        return;
      }

      if (quiz.id !== this.currentQuizId) {
        this.currentQuizId = quiz.id;
        this.currentRandomQuestions = null;
        this.questions.set(this.prepareQuestions(quiz.questions, normalizeQuizLimits(quiz.limits).randomQuestionOrder));
        this.resetQuizProgress();
        this.beginTimedAttempt(quiz);
      }
    });

    effect(() => {
      const attemptId = this.attemptId();
      const question = this.currentQuestion();
      const quiz = this.quiz();

      if (!attemptId || !question || !quiz || this.playBlockMessage() || this.cheatingMessage() || this.resultReady()) {
        return;
      }

      if (this.openingQuestionId === question.id || this.checkedQuestions().has(question.id)) {
        return;
      }

      this.openingQuestionId = question.id;
      this.quizApiService.openAttemptQuestion(quiz.id, attemptId, question.id).subscribe({
        next: (state) => this.applyServerClock(state),
        error: (error) => this.handleAttemptError(error),
      });
    });

    effect(() => {
      if (!this.resultReady() || this.resultSaved()) {
        return;
      }

      const user = this.authService.user();
      const quiz = this.quiz();

      if (!user || !quiz || quiz.id < 0) {
        return;
      }

      const totalQuestions = this.totalQuestions();

      if (totalQuestions === 0) {
        return;
      }

      if (this.cheatingMessage()) {
        this.resultSaved.set(true);
        this.resultSaveError.set(this.cheatingMessage());
        return;
      }

      const limits = normalizeQuizLimits(quiz.limits);
      const attemptId = this.attemptId();

      if (limitsAreActive(limits) && !attemptId) {
        return;
      }

      this.resultSaved.set(true);
      this.resultSaveError.set(null);
      const scaledMax = Math.max(0, this.quizScoreService.toScaledScore(this.maxScore()));
      let scaledScore = this.quizScoreService.toScaledScore(this.score());

      if (scaledScore > scaledMax) {
        scaledScore = scaledMax;
      }

      if (limitsAreActive(limits) && attemptId) {

        this.quizApiService.finishAttempt(quiz.id, attemptId).subscribe({
          next: () => this.persistScore(quiz.id, scaledScore, scaledMax, attemptId),
          error: (error) => this.handleSaveError(error),
        });
        return;
      }

      this.persistScore(quiz.id, scaledScore, scaledMax, null);
    });
  }

  ngOnDestroy(): void {
    this.stopTimers();
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
    this.attemptId.set(null);
    this.playBlockMessage.set(null);
    this.cheatingMessage.set(null);
    this.quizRemainingMs.set(null);
    this.questionRemainingMs.set(null);
    this.quizEndingSoon.set(false);
    this.questionEndingSoon.set(false);
    this.quizDeadlineLocal = null;
    this.questionDeadlineLocal = null;
    this.openingQuestionId = null;
    this.submittingQuestionIds.clear();
    this.quizAutoFinished = false;
    this.stopTimers();
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

  private finishCurrentQuestionCheck(question: QuestionPlayDTO, allowEmpty = false): void {
    const selectedAnswerIds = this.selectedAnswers()[question.id] ?? [];

    if ((selectedAnswerIds.length === 0 && !allowEmpty) || this.checkedQuestions().has(question.id)) {
      return;
    }

    const attemptId = this.attemptId();
    const quiz = this.quiz();

    if (attemptId && quiz && limitsAreActive(normalizeQuizLimits(quiz.limits))) {
      if (this.submittingQuestionIds.has(question.id)) {
        return;
      }

      this.submittingQuestionIds.add(question.id);
      // QUIZ_ANSWERS_IN: send the player's selected answer ids
      this.quizApiService.submitAttemptAnswers(quiz.id, attemptId, question.id, selectedAnswerIds).subscribe({
        next: () => {
          this.submittingQuestionIds.delete(question.id);
          this.applyLocalCheck(question, selectedAnswerIds);
        },
        error: (error) => {
          this.submittingQuestionIds.delete(question.id);
          this.handleAttemptError(error);
        },
      });
      return;
    }

    this.applyLocalCheck(question, selectedAnswerIds);
  }

  private applyLocalCheck(question: QuestionPlayDTO, selectedAnswerIds: number[]): void {
    this.submittedAnswers.update((answers) => ({
      ...answers,
      [question.id]: selectedAnswerIds,
    }));

    this.checkedQuestions.update((checkedQuestions) => {
      const next = new Set(checkedQuestions);
      next.add(question.id);
      return next;
    });

    if (this.quizAutoFinished || !this.canGoNext()) {
      this.resultReady.set(true);
      this.stopTimers();
    }
  }

  private beginTimedAttempt(quiz: QuizPlayDTO): void {
    const limits = normalizeQuizLimits(quiz.limits);

    if (!limitsAreActive(limits)) {
      return;
    }

    if (!this.authService.user() || quiz.id < 0) {
      this.playBlockMessage.set('Żeby rozwiązać quiz z limitem czasu lub podejść, zaloguj się.');
      return;
    }

    this.quizApiService.startAttempt(quiz.id).subscribe({
      next: (state) => {
        this.attemptId.set(state.attemptId);
        this.applyServerClock(state);
        this.startTimerLoops(quiz.id);
      },
      error: (error) => {
        this.playBlockMessage.set(this.readErrorMessage(error));
      },
    });
  }

  private startTimerLoops(quizId: number): void {
    this.stopTimers();
    this.tickHandle = window.setInterval(() => this.tickTimers(), 200);
    this.pollHandle = window.setInterval(() => this.pollAttempt(quizId), 1000);
  }

  private stopTimers(): void {
    if (this.tickHandle != null) {
      window.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }

    if (this.pollHandle != null) {
      window.clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  private pollAttempt(quizId: number): void {
    const attemptId = this.attemptId();

    if (!attemptId || this.resultReady() || this.cheatingMessage()) {
      return;
    }

    this.quizApiService.attemptState(quizId, attemptId, this.currentQuestion()?.id).subscribe({
      next: (state) => {
        this.applyServerClock(state);
        if (state.quizExpired) {
          this.expireQuiz();
        } else if (state.questionExpired) {
          this.expireQuestion();
        }
      },
    });
  }

  private applyServerClock(state: AttemptStateResponse): void {
    this.endingWarningMs = state.endingWarningSeconds * 1000;
    this.quizDeadlineLocal = state.quizRemainingMillis == null ? null : Date.now() + state.quizRemainingMillis;
    this.questionDeadlineLocal = state.questionRemainingMillis == null ? null : Date.now() + state.questionRemainingMillis;
    this.tickTimers();
  }

  private tickTimers(): void {
    if (this.resultReady() || this.cheatingMessage()) {
      return;
    }

    const now = Date.now();

    if (this.quizDeadlineLocal != null) {
      const left = this.quizDeadlineLocal - now;
      this.quizRemainingMs.set(Math.max(0, left));
      this.quizEndingSoon.set(left > 0 && left <= this.endingWarningMs);
      if (left <= 0) {
        this.expireQuiz();
      }
    } else {
      this.quizRemainingMs.set(null);
      this.quizEndingSoon.set(false);
    }

    if (this.questionDeadlineLocal != null) {
      const left = this.questionDeadlineLocal - now;
      this.questionRemainingMs.set(Math.max(0, left));
      this.questionEndingSoon.set(left > 0 && left <= this.endingWarningMs);
      if (left <= 0) {
        this.expireQuestion();
      }
    } else {
      this.questionRemainingMs.set(null);
      this.questionEndingSoon.set(false);
    }
  }

  private expireQuestion(): void {
    if (this.quizAutoFinished || this.cheatingMessage()) {
      return;
    }

    const question = this.currentQuestion();

    if (!question || this.checkedQuestions().has(question.id)) {
      return;
    }

    this.finishCurrentQuestionCheck(question, true);
  }

  private expireQuiz(): void {
    if (this.quizAutoFinished || this.resultReady() || this.cheatingMessage()) {
      return;
    }

    this.quizAutoFinished = true;
    const question = this.currentQuestion();

    if (question && !this.checkedQuestions().has(question.id)) {
      this.finishCurrentQuestionCheck(question, true);
      return;
    }

    this.resultReady.set(true);
    this.stopTimers();
  }

  private persistScore(quizId: number, score: number, maxScore: number, attemptId: number | null): void {
    this.quizScoreService
      .saveQuizResult({
        quizId,
        score,
        maxScore,
        attemptId,
      })
      .subscribe({
        error: (error) => this.handleSaveError(error),
      });
  }

  private handleSaveError(error: unknown): void {
    const message = this.readErrorMessage(error);

    if (message.startsWith('Oszustwo')) {
      this.cheatingMessage.set(message);
      this.resultSaveError.set(message);
      this.stopTimers();
      return;
    }

    this.resultSaved.set(false);
    this.resultSaveError.set(message);
  }

  private handleAttemptError(error: unknown): void {
    const message = this.readErrorMessage(error);

    if (message.startsWith('Oszustwo') || message.startsWith('Wykorzystano')) {
      this.cheatingMessage.set(message.startsWith('Oszustwo') ? message : null);
      this.playBlockMessage.set(message.startsWith('Wykorzystano') ? message : this.playBlockMessage());
      if (message.startsWith('Oszustwo')) {
        this.resultReady.set(true);
        this.resultSaveError.set(message);
        this.resultSaved.set(true);
      }
      this.stopTimers();
      return;
    }

    if (this.quizAutoFinished) {
      this.resultReady.set(true);
      this.stopTimers();
    }
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (typeof error.error === 'string' && error.error.trim()) {
        return error.error;
      }

      if (error.error && typeof error.error === 'object' && 'error' in error.error) {
        const nested = (error.error as { error?: unknown }).error;
        if (typeof nested === 'string' && nested.trim()) {
          return nested;
        }
      }
    }

    return 'Nie udało się zapisać rozwiązania.';
  }

  private formatDuration(milliseconds: number | null): string | null {
    if (milliseconds == null) {
      return null;
    }

    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
    return this.showAnswerFeedback() && answer.correct && (this.resultReady() || this.checkedQuestions().has(question.id));
  }

  isSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return (this.submittedAnswers()[question.id] ?? []).includes(answer.id);
  }

  isWrongSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return this.showAnswerFeedback() && this.isSubmittedAnswer(question, answer) && !answer.correct;
  }

  isCorrectSubmittedAnswer(question: QuestionPlayDTO, answer: AnswerPlayDTO): boolean {
    return this.showAnswerFeedback() && this.isSubmittedAnswer(question, answer) && answer.correct;
  }

  goBack(): void {
    this.router.navigateByUrl('/');
  }

  isQuestionChecked(question: QuestionPlayDTO): boolean {
    return this.checkedQuestions().has(question.id);
  }

  questionScoreText(question: QuestionPlayDTO): string {
    const selectedIds = this.submittedAnswers()[question.id] ?? [];
    const awarded = awardedQuestionScore(question.answers, selectedIds, this.scoring());
    const maxScore = questionMaxScore(question.answers, this.scoring());
    return `${this.formatScore(awarded)}/${this.formatScore(maxScore)}`;
  }

  answerPointsLabel(question: QuestionPlayDTO, answer: AnswerPlayDTO): string | null {
    if (!this.showAnswerFeedback() || this.scoring().mode !== 'custom' || (!this.isQuestionChecked(question) && !this.resultReady())) {
      return null;
    }

    return this.formatScore(answer.points ?? 0);
  }

  questionImageSrc(question: QuestionPlayDTO): string | null {
    return toImageSrc(question.image);
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

  private formatScore(score: number): string {
    const roundedScore = Math.round(score * 100) / 100;

    if (Number.isInteger(roundedScore)) {
      return roundedScore.toString();
    }

    return roundedScore.toFixed(2).replace(/0+$/, '').replace('.', ',');
  }
}
