import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AnswerPlayDTO } from '../../core/models/answer.model';
import { normalizeQuizLimits } from '../../core/models/quiz-limits.model';
import { QuestionPlayDTO } from '../../core/models/question.model';
import { QuizPlayDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { QuizScoreService } from '../../core/services/quiz-score.service';
import { toImageSrc } from '../../core/utils/image-compression.util';
import { awardedQuestionScore, normalizeQuizScoring, questionMaxScore } from '../../core/utils/quiz-scoring.util';

type QuizState =
  | { status: 'loading'; quiz: null; errorMessage: '' }
  | { status: 'ready'; quiz: QuizPlayDTO; errorMessage: '' }
  | { status: 'error'; quiz: null; errorMessage: string };

interface QuizRunOptions {
  randomQuestionOrder: boolean | null;
  anki: boolean | null;
}

type AnkiPlacement = 'soon' | 'middle' | 'nearEnd' | 'end';

interface QuizQuestionInstance extends QuestionPlayDTO {
  readonly runId: number;
}

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

  private readonly runOptions = toSignal(
    this.route.queryParamMap.pipe(
      map((params): QuizRunOptions => ({
        randomQuestionOrder: this.readOptionalBoolean(params.get('randomQuestionOrder')),
        anki: this.readOptionalBoolean(params.get('anki')),
      })),
    ),
    {
      initialValue: {
        randomQuestionOrder: null,
        anki: null,
      } satisfies QuizRunOptions,
    },
  );

  readonly selectedAnswers = signal<Record<number, number[]>>({});
  readonly submittedAnswers = signal<Record<number, number[]>>({});
  readonly checkedQuestions = signal<ReadonlySet<number>>(new Set());
  readonly questions = signal<QuizQuestionInstance[]>([]);
  readonly currentIndex = signal(0);
  readonly resultReady = signal(false);
  readonly resultSaved = signal(false);
  readonly resultSaveError = signal<string | null>(null);
  readonly showIncompleteConfirm = signal(false);
  readonly showExitConfirm = signal(false);
  readonly activeSelectedQuestionId = signal<number | null>(null);
  readonly ankiPlacements = signal<Record<number, AnkiPlacement>>({});
  readonly lastCheckedQuestionRunId = signal<number | null>(null);
  readonly ankiPlacementOptions: readonly AnkiPlacement[] = ['soon', 'middle', 'nearEnd', 'end'];
  readonly showAnswerFeedback = computed(() => {
    return normalizeQuizLimits(this.quiz()?.limits).showCorrectAnswers || this.resultReady();
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
  readonly isAnkiMode = computed(() => this.runOptions().anki === true);
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly canLeaveQuiz = computed(() => this.resultReady() || this.checkedQuestions().size === 0);
  readonly hasUnansweredQuestions = computed(() => {
    const currentQuestionId = this.currentQuestion()?.runId;
    const checkedQuestions = this.checkedQuestions();
    return this.questions().some((question) => question.runId !== currentQuestionId && !checkedQuestions.has(question.runId));
  });
  readonly currentQuestionChecked = computed(() => {
    const question = this.currentQuestion();
    return !!question && this.checkedQuestions().has(question.runId);
  });
  readonly canCheckCurrentQuestion = computed(() => {
    const question = this.currentQuestion();
    return (
      !!question &&
      !this.resultReady() &&
      (this.selectedAnswers()[question.runId]?.length ?? 0) > 0 &&
      !this.currentQuestionChecked()
    );
  });
  readonly scoring = computed(() => normalizeQuizScoring(this.quiz()?.scoring));
  readonly score = computed(() => {
    const submittedAnswers = this.submittedAnswers();
    const scoring = this.scoring();

    return this.questions().reduce(
      (totalScore, question) =>
        totalScore + awardedQuestionScore(question.answers, submittedAnswers[question.runId] ?? [], scoring),
      0,
    );
  });
  readonly maxScore = computed(() =>
    this.questions().reduce((total, question) => total + questionMaxScore(question.answers, this.scoring()), 0),
  );
  readonly formattedScore = computed(() => this.formatScore(this.score()));
  readonly formattedMaxScore = computed(() => this.formatScore(this.maxScore()));
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
        const configuredRandomQuestions = normalizeQuizLimits(quiz.limits).randomQuestionOrder;
        const randomQuestions = this.runOptions().randomQuestionOrder ?? configuredRandomQuestions;
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

      if (this.isAnkiMode() || !user || !quiz || quiz.id < 0) {
        return;
      }

      const totalQuestions = this.totalQuestions();

      if (totalQuestions === 0) {
        return;
      }

      this.resultSaved.set(true);
      this.resultSaveError.set(null);
      const scaledMax = Math.max(0, this.quizScoreService.toScaledScore(this.maxScore()));
      let scaledScore = this.quizScoreService.toScaledScore(this.score());

      if (scaledScore > scaledMax) {
        scaledScore = scaledMax;
      }

      this.persistScore(quiz.id, scaledScore, scaledMax);
    });
  }

  selectAnswer(question: QuizQuestionInstance, answer: AnswerPlayDTO): void {
    if (this.checkedQuestions().has(question.runId) || this.resultReady()) {
      return;
    }

    this.selectedAnswers.update((answers) => {
      const selectedAnswerIds = answers[question.runId] ?? [];
      const isSelected = selectedAnswerIds.includes(answer.id);
      const nextSelectedAnswerIds = isSelected
        ? selectedAnswerIds.filter((answerId) => answerId !== answer.id)
        : [...selectedAnswerIds, answer.id];

      return {
        ...answers,
        [question.runId]: nextSelectedAnswerIds,
      };
    });
    this.activeSelectedQuestionId.set(question.runId);
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
    this.ankiPlacements.set({});
    this.lastCheckedQuestionRunId.set(null);
  }

  private nextQuestionRunId = 1;

  private prepareQuestions(questions: QuestionPlayDTO[], randomQuestions: boolean): QuizQuestionInstance[] {
    const questionsWithRandomAnswers = questions.map((question) => ({
      ...question,
      runId: this.nextQuestionRunId++,
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

  private finishCurrentQuestionCheck(question: QuizQuestionInstance, allowEmpty = false): void {
    const selectedAnswerIds = this.selectedAnswers()[question.runId] ?? [];

    if ((selectedAnswerIds.length === 0 && !allowEmpty) || this.checkedQuestions().has(question.runId)) {
      return;
    }

    this.applyLocalCheck(question, selectedAnswerIds);
  }

  private applyLocalCheck(question: QuizQuestionInstance, selectedAnswerIds: number[]): void {
    this.submittedAnswers.update((answers) => ({
      ...answers,
      [question.runId]: selectedAnswerIds,
    }));

    this.checkedQuestions.update((checkedQuestions) => {
      const next = new Set(checkedQuestions);
      next.add(question.runId);
      return next;
    });

    if (this.isAnkiMode()) {
      this.lastCheckedQuestionRunId.set(question.runId);
    }

    if (!this.canGoNext()) {
      this.resultReady.set(true);
    }
  }

  scheduleCurrentQuestion(placement: AnkiPlacement): void {
    const question = this.currentQuestion();

    if (
      !this.isAnkiMode() ||
      !question ||
      !this.currentQuestionChecked() ||
      this.isLastQuestion() ||
      this.ankiPlacements()[question.runId]
    ) {
      return;
    }

    const anchorRunId = this.lastCheckedQuestionRunId();
    const anchorIndex = this.questions().findIndex((candidate) => candidate.runId === anchorRunId);

    if (anchorIndex < 0) {
      return;
    }

    const remainingCount = this.questions().length - anchorIndex - 1;
    const insertionOffset = this.ankiInsertionOffset(placement, remainingCount);
    const copy: QuizQuestionInstance = {
      ...question,
      runId: this.nextQuestionRunId++,
      answers: [...question.answers],
    };
    const questions = this.questions();
    const insertionIndex = anchorIndex + insertionOffset + 1;
    const nextQuestions = [
      ...questions.slice(0, insertionIndex),
      copy,
      ...questions.slice(insertionIndex),
    ];

    this.questions.set(nextQuestions);
    this.currentIndex.set(nextQuestions.findIndex((candidate) => candidate.runId === question.runId));
    this.ankiPlacements.update((placements) => ({
      ...placements,
      [question.runId]: placement,
    }));
  }

  ankiPlacementLabel(placement: AnkiPlacement): string {
    return {
      soon: 'Za chwilę',
      middle: 'W środek',
      nearEnd: 'Pod koniec',
      end: 'Na koniec',
    }[placement];
  }

  private ankiInsertionOffset(placement: AnkiPlacement, remainingCount: number): number {
    const offsets: Record<AnkiPlacement, number> = {
      soon: Math.ceil(remainingCount / 4),
      middle: Math.ceil(remainingCount / 2),
      nearEnd: Math.ceil((remainingCount * 3) / 4),
      end: remainingCount,
    };

    return offsets[placement];
  }

  private persistScore(quizId: number, score: number, maxScore: number): void {
    this.quizScoreService
      .saveQuizResult({
        quizId,
        score,
        maxScore,
      })
      .subscribe({
        error: (error) => this.handleSaveError(error),
      });
  }

  private handleSaveError(error: unknown): void {
    const message = this.readErrorMessage(error);

    this.resultSaved.set(false);
    this.resultSaveError.set(message);
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

  isSelectedAnswer(question: QuizQuestionInstance, answer: AnswerPlayDTO): boolean {
    const selectedAnswerIds = this.selectedAnswers()[question.runId] ?? [];
    const isChecked = this.checkedQuestions().has(question.runId);

    return selectedAnswerIds.includes(answer.id) && (isChecked || this.activeSelectedQuestionId() === question.runId);
  }

  isCorrectAnswerVisible(question: QuizQuestionInstance, answer: AnswerPlayDTO): boolean {
    return this.showAnswerFeedback() && answer.correct && (this.resultReady() || this.checkedQuestions().has(question.runId));
  }

  isSubmittedAnswer(question: QuizQuestionInstance, answer: AnswerPlayDTO): boolean {
    return (this.submittedAnswers()[question.runId] ?? []).includes(answer.id);
  }

  isWrongSubmittedAnswer(question: QuizQuestionInstance, answer: AnswerPlayDTO): boolean {
    return this.showAnswerFeedback() && this.isSubmittedAnswer(question, answer) && !answer.correct;
  }

  isCorrectSubmittedAnswer(question: QuizQuestionInstance, answer: AnswerPlayDTO): boolean {
    return this.showAnswerFeedback() && this.isSubmittedAnswer(question, answer) && answer.correct;
  }

  goBack(): void {
    this.router.navigateByUrl('/');
  }

  isQuestionChecked(question: QuizQuestionInstance): boolean {
    return this.checkedQuestions().has(question.runId);
  }

  questionScoreText(question: QuizQuestionInstance): string {
    const selectedIds = this.submittedAnswers()[question.runId] ?? [];
    const awarded = awardedQuestionScore(question.answers, selectedIds, this.scoring());
    const maxScore = questionMaxScore(question.answers, this.scoring());
    return `${this.formatScore(awarded)}/${this.formatScore(maxScore)}`;
  }

  answerPointsLabel(question: QuizQuestionInstance, answer: AnswerPlayDTO): string | null {
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

    if (!question || this.checkedQuestions().has(question.runId)) {
      return;
    }

    this.selectedAnswers.update((answers) => {
      const next = { ...answers };
      delete next[question.runId];
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

  private readOptionalBoolean(value: string | null): boolean | null {
    if (value === 'true') {
      return true;
    }

    if (value === 'false') {
      return false;
    }

    return null;
  }
}
