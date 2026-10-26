import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AnswerPlayDTO } from '../../core/models/answer.model';
import { normalizeQuizLimits } from '../../core/models/quiz-limits.model';
import { QuestionPlayDTO } from '../../core/models/question.model';
import { QuizPlayDTO, RankingFinishDTO } from '../../core/models/quiz.model';
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
  studyMode: boolean | null;
}

type StudyPlacement = 'soon' | 'middle' | 'nearEnd' | 'end';

interface QuizQuestionInstance extends QuestionPlayDTO {
  readonly runId: number;
  readonly rankingQuestionIndex: number;
  readonly rankingAnswerIndexes: Record<number, number>;
}

@Component({
  selector: 'app-quiz-play-page',
  standalone: true,
  templateUrl: './quiz-play-page.component.html',
  styleUrl: './quiz-play-page.component.css',
})
export class QuizPlayPageComponent {
  private static readonly MAX_RANKING_DURATION_MS = 6 * 60 * 60 * 1000;
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
        studyMode: this.readOptionalBoolean(params.get('studyMode')),
      })),
    ),
    {
      initialValue: {
        randomQuestionOrder: null,
        studyMode: null,
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
  readonly completedAttemptRecorded = signal(false);
  readonly resultSaveError = signal<string | null>(null);
  readonly showIncompleteConfirm = signal(false);
  readonly showExitConfirm = signal(false);
  readonly activeSelectedQuestionId = signal<number | null>(null);
  readonly studyPlacements = signal<Record<number, StudyPlacement>>({});
  readonly lastCheckedQuestionRunId = signal<number | null>(null);
  readonly rankingAttemptId = signal<string | null>(null);
  readonly rankingResult = signal<RankingFinishDTO | null>(null);
  readonly rankingSeconds = signal(0);
  readonly confettiPieces = Array.from({ length: 36 }, (_, index) => index);
  private rankingTimer: ReturnType<typeof setInterval> | null = null;
  private rankingDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private rankingStartedAt = 0;
  readonly studyPlacementOptions: readonly StudyPlacement[] = ['soon', 'middle', 'nearEnd', 'end'];
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
  readonly isStudyMode = computed(() => this.runOptions().studyMode === true);
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
  readonly scorePercent = computed(() => this.formatPercentage(this.score(), this.maxScore()));

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
        if (quiz.rankingEnabled && this.authService.isLoggedIn() && this.runOptions().studyMode !== true && quiz.id > 0) this.startRanking(quiz.id);
      }
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

      if (this.isStudyMode()) {
        if (!this.completedAttemptRecorded()) {
          this.completedAttemptRecorded.set(true);
          this.recordCompletedAttempt(quiz.id);
        }
        return;
      }

      if (quiz.rankingEnabled && this.rankingAttemptId()) this.finishRanking(quiz.id);

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
    this.completedAttemptRecorded.set(false);
    this.resultSaveError.set(null);
    this.showIncompleteConfirm.set(false);
    this.showExitConfirm.set(false);
    this.activeSelectedQuestionId.set(null);
    this.studyPlacements.set({});
    this.lastCheckedQuestionRunId.set(null);
    this.rankingAttemptId.set(null);
    this.rankingResult.set(null);
    this.rankingSeconds.set(0);
    this.stopRankingTimers();
  }

  private nextQuestionRunId = 1;

  private prepareQuestions(questions: QuestionPlayDTO[], randomQuestions: boolean): QuizQuestionInstance[] {
    const questionsWithRandomAnswers = questions.map((question, rankingQuestionIndex) => ({
      ...question,
      runId: this.nextQuestionRunId++,
      answers: this.shuffle(question.answers),
      rankingQuestionIndex,
      rankingAnswerIndexes: Object.fromEntries(question.answers.map((answer, index) => [answer.id, index])),
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

    if (this.isStudyMode()) {
      this.lastCheckedQuestionRunId.set(question.runId);
    }

    if (!this.canGoNext()) {
      this.resultReady.set(true);
    }
  }

  scheduleCurrentQuestion(placement: StudyPlacement): void {
    const question = this.currentQuestion();

    if (
      !this.isStudyMode() ||
      this.resultReady() ||
      !question ||
      !this.currentQuestionChecked() ||
      this.isLastQuestion() ||
      this.studyPlacements()[question.runId]
    ) {
      return;
    }

    const anchorRunId = this.lastCheckedQuestionRunId();
    const anchorIndex = this.questions().findIndex((candidate) => candidate.runId === anchorRunId);

    if (anchorIndex < 0) {
      return;
    }

    const remainingCount = this.questions().length - anchorIndex - 1;
    const insertionOffset = this.studyInsertionOffset(placement, remainingCount);
    const copy: QuizQuestionInstance = {
      ...question,
      runId: this.nextQuestionRunId++,
      answers: this.shuffle(question.answers),
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
    this.studyPlacements.update((placements) => ({
      ...placements,
      [question.runId]: placement,
    }));
  }

  studyPlacementLabel(placement: StudyPlacement): string {
    return {
      soon: 'Na początek',
      middle: 'W środek',
      nearEnd: 'Pod koniec',
      end: 'Na koniec',
    }[placement];
  }

  private studyInsertionOffset(placement: StudyPlacement, remainingCount: number): number {
    const offsets: Record<StudyPlacement, number> = {
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

  private startRanking(quizId: number): void {
    this.quizApiService.startRankingAttempt(quizId).subscribe({
      next: ({ attemptId }) => {
        this.rankingAttemptId.set(attemptId);
        this.rankingStartedAt = Date.now();
        this.rankingTimer = setInterval(() => {
          const elapsedMs = Date.now() - this.rankingStartedAt;
          this.rankingSeconds.set(Math.min(Math.floor(elapsedMs / 1000), QuizPlayPageComponent.MAX_RANKING_DURATION_MS / 1000));
          if (elapsedMs >= QuizPlayPageComponent.MAX_RANKING_DURATION_MS) this.finishQuizDueToRankingTimeLimit();
        }, 250);
        this.rankingDeadlineTimer = setTimeout(
          () => this.finishQuizDueToRankingTimeLimit(),
          QuizPlayPageComponent.MAX_RANKING_DURATION_MS,
        );
      },
    });
  }

  private finishRanking(quizId: number): void {
    const attemptId = this.rankingAttemptId();
    if (!attemptId || this.rankingResult()) return;
    this.stopRankingTimers();
    const answers = this.questions().map((question) => ({
      questionIndex: question.rankingQuestionIndex,
      answerIndexes: (this.submittedAnswers()[question.runId] ?? []).map((answerId) => question.rankingAnswerIndexes[answerId]).filter((index): index is number => index !== undefined),
    }));
    this.quizApiService.finishRankingAttempt(quizId, attemptId, answers).subscribe({ next: (result) => this.rankingResult.set(result) });
  }

  rankingTimeText(): string {
    const seconds = this.rankingSeconds();
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return hours > 0
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  rankingDurationText(milliseconds: number): string {
    const safeMilliseconds = Math.max(0, milliseconds);
    const hours = Math.floor(safeMilliseconds / 3_600_000);
    const minutes = Math.floor((safeMilliseconds % 3_600_000) / 60_000);
    const seconds = ((safeMilliseconds % 60_000) / 1000).toFixed(3).replace('.', ',');
    if (hours > 0) return `${hours} godz. ${minutes} min ${seconds} s`;
    if (minutes > 0) return `${minutes} min ${seconds} s`;
    return `${seconds} s`;
  }

  rankingPercentText(scoreScaled: number, maxScoreScaled: number): string {
    return `${this.formatPercentage(scoreScaled, maxScoreScaled)}%`;
  }

  private formatPercentage(score: number, maximum: number): string {
    if (maximum === 0) return '0';
    const value = Math.round((score / maximum) * 10_000) / 100;
    return value.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  }

  private finishQuizDueToRankingTimeLimit(): void {
    if (this.resultReady() || !this.rankingAttemptId()) return;

    const question = this.currentQuestion();
    if (question && !this.currentQuestionChecked()) {
      const selectedAnswerIds = this.selectedAnswers()[question.runId] ?? [];
      if (selectedAnswerIds.length > 0) this.finishCurrentQuestionCheck(question);
    }

    this.showIncompleteConfirm.set(false);
    this.resultReady.set(true);
  }

  private stopRankingTimers(): void {
    if (this.rankingTimer) {
      clearInterval(this.rankingTimer);
      this.rankingTimer = null;
    }
    if (this.rankingDeadlineTimer) {
      clearTimeout(this.rankingDeadlineTimer);
      this.rankingDeadlineTimer = null;
    }
  }

  private recordCompletedAttempt(quizId: number): void {
    this.quizScoreService.recordCompletedAttempt(quizId).subscribe();
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
      this.goToQuestion(this.currentIndex() + 1);
    }
  }

  goToQuestion(index: number): void {
    if (index < 0 || index >= this.totalQuestions() || index === this.currentIndex()) {
      return;
    }

    this.showIncompleteConfirm.set(false);
    this.showExitConfirm.set(false);
    this.clearPendingSelectionForCurrentQuestion();
    this.activeSelectedQuestionId.set(null);
    this.currentIndex.set(index);
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

  isQuestionFullyCorrect(question: QuizQuestionInstance): boolean {
    if (!this.isQuestionChecked(question)) {
      return false;
    }

    const selectedAnswerIds = this.submittedAnswers()[question.runId] ?? [];
    const correctAnswerIds = question.answers
      .filter((answer) => answer.correct)
      .map((answer) => answer.id);

    return (
      selectedAnswerIds.length === correctAnswerIds.length &&
      correctAnswerIds.every((answerId) => selectedAnswerIds.includes(answerId))
    );
  }

  questionScorePercentage(question: QuizQuestionInstance): number {
    if (!this.isQuestionChecked(question)) {
      return 0;
    }

    const selectedIds = this.submittedAnswers()[question.runId] ?? [];
    const awarded = awardedQuestionScore(question.answers, selectedIds, this.scoring());
    const maximum = questionMaxScore(question.answers, this.scoring());

    // Pytanie z maksymalnym wynikiem 0 może wystąpić przy niestandardowej
    // punktacji. Wtedy pełna poprawność nadal oznacza 100%, a każda inna
    // odpowiedź 0%.
    if (maximum <= 0) {
      return this.isQuestionFullyCorrect(question) ? 100 : 0;
    }

    return Math.max(0, Math.min(100, (awarded / maximum) * 100));
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
