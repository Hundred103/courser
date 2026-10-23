import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { DEFAULT_QUIZ_LIMITS, QuizLimits, normalizeQuizLimits } from '../../core/models/quiz-limits.model';
import { QuizCreateDTO, QuizPlayDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { compressImageFile, toImageSrc } from '../../core/utils/image-compression.util';
import { normalizeQuizScoring, QuizScoring } from '../../core/utils/quiz-scoring.util';

const NEW_QUIZ_SCORING: QuizScoring = {
  mode: 'default',
  allowNegativeScore: false,
  pointsPerCorrect: 1,
  incorrectPenalty: 1,
  penaltyMode: 'fraction',
};

const MAX_SCORE_VALUE = 99.99;
interface DraftAnswer {
  id: number;
  content: string;
  correct: boolean;
  points: number | null;
}

interface DraftQuestion {
  id: number;
  content: string;
  image: string | null;
  answers: DraftAnswer[];
}

interface DraftSnapshot {
  title: string;
  questions: DraftQuestion[];
  scoring: QuizScoring;
  limits: QuizLimits;
}

@Component({
  selector: 'app-quiz-create-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './quiz-create-page.component.html',
  styleUrl: './quiz-create-page.component.css',
})
export class QuizCreatePageComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly quizApiService = inject(QuizApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly routeSubscription: Subscription;
  private nextQuestionId = 2;
  private nextAnswerId = 2;
  private readonly scoreInputRestoreTimers = new WeakMap<HTMLInputElement, ReturnType<typeof setTimeout>>();
  private exitDecision: ((canLeave: boolean) => void) | null = null;
  private exitDecisionPromise: Promise<boolean> | null = null;
  private quizSaved = false;
  private initialDraftSignature = '';
  private initialDraft: DraftSnapshot | null = null;
  private rememberedPointPenalty = NEW_QUIZ_SCORING.incorrectPenalty;
  private rememberedPercentPenalty = 50;
  private stashedScoring: QuizScoring | null = null;
  private initialRankingSignature = '';
  private pendingRankingCopyAction: (() => void) | null = null;

  readonly title = signal('');
  readonly scoring = signal<QuizScoring>({ ...NEW_QUIZ_SCORING });
  readonly limits = signal<QuizLimits>({ ...DEFAULT_QUIZ_LIMITS });
  readonly useDefaultPointsLook = signal(true);
  readonly questions = signal<DraftQuestion[]>([
    {
      id: 1,
      content: '',
      image: null,
      answers: [{ id: 1, content: '', correct: false, points: null }],
    },
  ]);
  readonly currentIndex = signal(0);
  readonly isSaving = signal(false);
  readonly isLoadingQuiz = signal(false);
  readonly saveError = signal('');
  readonly loadError = signal('');
  readonly showExitConfirm = signal(false);
  readonly showAuthPrompt = signal(false);
  readonly editingQuizId = signal<number | null>(null);
  readonly rankingProtected = signal(false);
  readonly showRankingCopyConfirm = signal(false);

  readonly isEditMode = computed(() => this.editingQuizId() !== null);
  readonly usesCustomPoints = computed(() => this.scoring().mode === 'custom');
  readonly usesPercentPenalty = computed(() => this.scoring().penaltyMode === 'percent');
  readonly showPointControls = computed(() => !this.useDefaultPointsLook());
  readonly wrongAnswerPoints = computed(() => -this.scoring().incorrectPenalty);
  readonly canUndoChanges = computed(
    () => this.isEditMode() && this.hasUnsavedChanges() && !this.isSaving() && !this.isLoadingQuiz(),
  );
  readonly totalQuestions = computed(() => this.questions().length);
  readonly currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  readonly currentQuestionNumber = computed(() => this.currentIndex() + 1);
  readonly canGoPrevious = computed(() => this.currentIndex() > 0);
  readonly canSave = computed(() => {
    const hasTitle = this.title().trim().length > 0;
    const hasValidQuestions = this.questions().every((question) => this.isQuestionReady(question));

    return hasTitle && hasValidQuestions && !this.isSaving() && !this.isLoadingQuiz();
  });
  readonly saveButtonTitle = computed(() => {
    if (this.canSave()) {
      return '';
    }

    if (
      this.usesCustomPoints() &&
      this.questions().some((question) => question.answers.some((answer) => !Number.isFinite(answer.points)))
    ) {
      return 'Każda odpowiedź musi mieć własne punkty';
    }

    return 'Pola tytuł, pytanie i odpowiedź muszą być wypełnione';
  });

  constructor() {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const quizId = Number(params.get('id'));

      if (Number.isFinite(quizId) && quizId > 0) {
        this.loadQuizForEdit(quizId);
        return;
      }

      this.prepareNewQuiz();
    });
  }

  ngOnDestroy(): void {
    this.routeSubscription.unsubscribe();
  }

  updateTitle(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
    this.saveError.set('');
  }

  toggleDefaultPointsLook(event: Event): void {
    const input = event.target as HTMLInputElement;
    const useDefault = input.checked;

    if (this.rankingProtected()) {
      input.checked = this.useDefaultPointsLook();
    }

    this.requestRankingCopyForAction(() => this.applyDefaultPointsLook(useDefault));
  }

  private applyDefaultPointsLook(useDefault: boolean): void {

    if (useDefault) {
      const current = this.scoring();

      this.stashedScoring = this.isPlainDefaultPoints(current) ? null : { ...current };
      this.scoring.set({ ...NEW_QUIZ_SCORING, allowNegativeScore: current.allowNegativeScore });
      this.useDefaultPointsLook.set(true);
      this.saveError.set('');
      return;
    }

    this.useDefaultPointsLook.set(false);

    if (this.stashedScoring) {
      const restored = this.scoringForOpenControls({
        ...this.stashedScoring,
        allowNegativeScore: this.scoring().allowNegativeScore,
      });
      this.stashedScoring = null;
      this.scoring.set(restored);
      this.syncRememberedPenalties(restored);
      this.saveError.set('');
      return;
    }

    const opened = this.scoringForOpenControls(this.scoring());
    this.scoring.set(opened);
    this.rememberedPointPenalty = opened.incorrectPenalty;

    this.saveError.set('');
  }

  togglePerAnswerPoints(event: Event): void {
    const input = event.target as HTMLInputElement;
    const usePerAnswerPoints = input.checked;

    if (this.rankingProtected()) {
      input.checked = this.usesCustomPoints();
    }

    this.requestRankingCopyForAction(() => this.applyPerAnswerPointsToggle(usePerAnswerPoints));
  }

  private applyPerAnswerPointsToggle(usePerAnswerPoints: boolean): void {

    if (!usePerAnswerPoints) {
      this.scoring.update((scoring) => ({
        ...scoring,
        mode: 'default',
        penaltyMode: scoring.penaltyMode === 'percent' ? 'percent' : 'points',
      }));
      this.saveError.set('');
      return;
    }

    const current = {
      ...this.scoring(),
      penaltyMode: this.scoring().penaltyMode === 'percent' ? ('percent' as const) : ('points' as const),
    };
    this.questions.update((questions) =>
      questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) => ({
          ...answer,
          points: this.suggestedPoints(answer, current),
        })),
      })),
    );
    this.scoring.set({ ...current, mode: 'custom' });
    this.saveError.set('');
  }

  updateLimitFlag(field: 'randomQuestionOrder' | 'showCorrectAnswers', event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.limits.update((limits) => ({ ...limits, [field]: checked }));
    this.saveError.set('');
  }

  blockScoreKey(event: KeyboardEvent, allowNegative: boolean): void {
    if (event.ctrlKey || event.metaKey || ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const input = event.target as HTMLInputElement;
    const replacesAll = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    const currentValue = input.value;

    if (event.key === '-' && allowNegative && (currentValue === '' || replacesAll)) {
      return;
    }

    if (/^\d$/.test(event.key)) {
      if (!replacesAll && (currentValue === '0' || currentValue === '-0')) {
        event.preventDefault();
      }

      return;
    }

    if (event.key === '.' || event.key === ',') {
      const selectionStart = input.selectionStart ?? currentValue.length;
      const selectionEnd = input.selectionEnd ?? currentValue.length;
      const selectedValue = currentValue.slice(selectionStart, selectionEnd);
      const alreadyHasSeparator = /[.,]/.test(currentValue) && !/[.,]/.test(selectedValue);

      if (alreadyHasSeparator || (allowNegative && currentValue === '0' && !replacesAll)) {
        event.preventDefault();
      }

      return;
    }

    if (event.key === '-' && !allowNegative) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
  }

  toggleAllowNegative(event: Event): void {
    const input = event.target as HTMLInputElement;
    const allowNegativeScore = input.checked;

    if (this.rankingProtected()) {
      input.checked = this.scoring().allowNegativeScore;
    }

    this.requestRankingCopyForAction(() => this.applyAllowNegativeToggle(allowNegativeScore));
  }

  private applyAllowNegativeToggle(allowNegativeScore: boolean): void {
    this.scoring.update((scoring) => ({ ...scoring, allowNegativeScore }));
    this.saveError.set('');
  }

  togglePercentPenalty(event: Event): void {
    const input = event.target as HTMLInputElement;
    const usePercent = input.checked;

    if (this.rankingProtected()) {
      input.checked = this.usesPercentPenalty();
    }

    this.requestRankingCopyForAction(() => this.applyPercentPenaltyToggle(usePercent));
  }

  private applyPercentPenaltyToggle(usePercent: boolean): void {
    const scoring = this.scoring();

    if (usePercent) {
      if (scoring.penaltyMode !== 'percent') {
        this.rememberedPointPenalty = scoring.incorrectPenalty;
      }

      this.scoring.set({
        ...scoring,
        mode: 'default',
        penaltyMode: 'percent',
        incorrectPenalty: this.rememberedPercentPenalty,
      });
    } else {
      if (scoring.penaltyMode === 'percent') {
        this.rememberedPercentPenalty = scoring.incorrectPenalty;
      }

      this.scoring.set({
        ...scoring,
        mode: 'default',
        penaltyMode: 'points',
        incorrectPenalty: this.rememberedPointPenalty,
      });
    }

    this.saveError.set('');
  }

  updateCorrectAnswerPoints(event: Event): void {
    const parsed = this.readBoundedScoreInput(event, 0, MAX_SCORE_VALUE);

    if (parsed === null) {
      return;
    }

    const pointsPerCorrect = Math.max(0, parsed);
    this.scoring.update((scoring) => ({
      ...scoring,
      pointsPerCorrect,
      penaltyMode: scoring.penaltyMode === 'percent' ? 'percent' : 'points',
    }));
    this.applySharedPoints((answer) => (answer.correct ? pointsPerCorrect : answer.points));
    this.saveError.set('');
  }

  updateWrongAnswerPoints(event: Event): void {
    const parsed = this.readBoundedScoreInput(event, -MAX_SCORE_VALUE, 0);

    if (parsed === null) {
      return;
    }

    const wrongPoints = Math.min(0, parsed);
    const incorrectPenalty = -wrongPoints;
    this.rememberedPointPenalty = incorrectPenalty;
    this.scoring.update((scoring) => ({ ...scoring, penaltyMode: 'points', incorrectPenalty }));
    this.applySharedPoints((answer) => (answer.correct ? answer.points : wrongPoints));
    this.saveError.set('');
  }

  updatePercentPenalty(event: Event): void {
    const parsed = this.readBoundedScoreInput(event, 0, MAX_SCORE_VALUE);

    if (parsed === null) {
      return;
    }

    const incorrectPenalty = Math.max(0, parsed);
    this.rememberedPercentPenalty = incorrectPenalty;
    this.scoring.update((scoring) => ({ ...scoring, mode: 'default', penaltyMode: 'percent', incorrectPenalty }));
    this.saveError.set('');
  }

  updateQuestionContent(event: Event): void {
    const content = (event.target as HTMLTextAreaElement).value;
    const currentQuestion = this.currentQuestion();

    if (!currentQuestion) {
      return;
    }

    this.questions.update((questions) =>
      questions.map((question) => (question.id === currentQuestion.id ? { ...question, content } : question)),
    );
    this.saveError.set('');
  }

  async selectQuestionImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const currentQuestion = this.currentQuestion();

    input.value = '';

    if (!file || !currentQuestion) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.saveError.set('Wybierz plik graficzny.');
      return;
    }

    try {
      const image = await compressImageFile(file);
      this.requestRankingCopyForAction(() => this.setQuestionImage(currentQuestion.id, image));
    } catch {
      this.saveError.set('Nie udało się przetworzyć obrazu.');
    }
  }

  removeQuestionImage(): void {
    const currentQuestion = this.currentQuestion();

    if (!currentQuestion) {
      return;
    }

    this.requestRankingCopyForAction(() => this.setQuestionImage(currentQuestion.id, null));
  }

  private setQuestionImage(questionId: number, image: string | null): void {
    this.questions.update((questions) =>
      questions.map((question) => (question.id === questionId ? { ...question, image } : question)),
    );
    this.saveError.set('');
  }

  questionImageSrc(image: string | null): string | null {
    return toImageSrc(image);
  }

  updateAnswerContent(answerId: number, event: Event): void {
    const content = (event.target as HTMLInputElement).value;
    this.updateCurrentQuestionAnswers((answers) =>
      answers.map((answer) => (answer.id === answerId ? { ...answer, content } : answer)),
    );
  }

  toggleCorrectAnswer(answerId: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const correct = input.checked;
    const currentCorrect = this.currentQuestion()?.answers.find((answer) => answer.id === answerId)?.correct;

    if (this.rankingProtected() && currentCorrect !== undefined) {
      input.checked = currentCorrect;
    }

    this.requestRankingCopyForAction(() => this.applyCorrectAnswerToggle(answerId, correct));
  }

  private applyCorrectAnswerToggle(answerId: number, correct: boolean): void {
    const scoring = this.scoring();
    const rightPoints = scoring.pointsPerCorrect;
    const wrongPoints = this.fixedWrongPoints(scoring);

    this.updateCurrentQuestionAnswers((answers) =>
      answers.map((answer) => {
        if (answer.id !== answerId) {
          return answer;
        }

        if (scoring.mode !== 'custom') {
          return { ...answer, correct };
        }

        const stillShared = answer.points === null || answer.points === rightPoints || answer.points === wrongPoints;
        const points = stillShared ? (correct ? rightPoints : wrongPoints) : answer.points;

        return {
          ...answer,
          correct,
          points: this.clampScoreValue(points ?? 0, correct ? 0 : -MAX_SCORE_VALUE, correct ? MAX_SCORE_VALUE : 0),
        };
      }),
    );
  }

  updateAnswerPoints(answerId: number, event: Event): void {
    const answer = this.currentQuestion()?.answers.find((candidate) => candidate.id === answerId);

    if (!answer) {
      return;
    }

    const parsed = this.readBoundedScoreInput(event, answer.correct ? 0 : -MAX_SCORE_VALUE, answer.correct ? MAX_SCORE_VALUE : 0);

    if (parsed === null) {
      return;
    }

    this.updateCurrentQuestionAnswers((answers) =>
      answers.map((answer) => (answer.id === answerId ? { ...answer, points: parsed } : answer)),
    );
  }

  addAnswer(): void {
    this.requestRankingCopyForAction(() => {
      const answer = this.blankAnswer();
      this.nextAnswerId += 1;
      this.updateCurrentQuestionAnswers((answers) => [...answers, answer]);
    });
  }

  removeAnswer(answerId: number): void {
    this.requestRankingCopyForAction(() => {
      this.updateCurrentQuestionAnswers((answers) => {
        if (answers.length <= 1) {
          return answers;
        }

        return answers.filter((answer) => answer.id !== answerId);
      });
    });
  }

  removeCurrentQuestion(): void {
    const currentQuestion = this.currentQuestion();

    if (!currentQuestion || this.totalQuestions() <= 1) {
      return;
    }

    this.requestRankingCopyForAction(() => this.removeQuestionById(currentQuestion.id));
  }

  private removeQuestionById(questionId: number): void {
    this.questions.update((questions) => questions.filter((question) => question.id !== questionId));
    this.currentIndex.update((index) => Math.min(index, this.totalQuestions() - 1));
    this.saveError.set('');
  }

  requestExitQuiz(): void {
    void this.router.navigateByUrl('/');
  }

  cancelExitQuiz(): void {
    this.showExitConfirm.set(false);
    this.resolveExitDecision(false);
  }

  confirmExitQuiz(): void {
    this.showExitConfirm.set(false);
    this.resolveExitDecision(true);
  }

  cancelAuthPrompt(): void {
    this.showAuthPrompt.set(false);
    void this.router.navigate(['/']);
  }

  goToLogin(): void {
    this.showAuthPrompt.set(false);
    void this.router.navigate(['/login']);
  }

  undoChanges(): void {
    if (!this.canUndoChanges() || !this.initialDraft) {
      return;
    }

    this.title.set(this.initialDraft.title);
    this.scoring.set({ ...this.initialDraft.scoring });
    this.syncRememberedPenalties(this.initialDraft.scoring);
    this.stashedScoring = null;
    this.useDefaultPointsLook.set(this.isPlainDefaultPoints(this.initialDraft.scoring));
    this.limits.set({ ...this.initialDraft.limits });
    this.questions.set(this.cloneQuestions(this.initialDraft.questions));
    this.currentIndex.set(this.questions().length - 1);
    this.recalculateNextIds();
    this.saveError.set('');
  }

  canDeactivate(): boolean | Promise<boolean> {
    if (this.quizSaved || !this.hasUnsavedChanges()) {
      return true;
    }

    this.showExitConfirm.set(true);
    return this.getExitDecision();
  }

  goPrevious(): void {
    if (this.canGoPrevious()) {
      this.currentIndex.update((index) => index - 1);
      this.saveError.set('');
    }
  }

  goNext(): void {
    if (this.currentIndex() === this.totalQuestions() - 1) {
      this.requestRankingCopyForAction(() => this.addNextQuestion());
      return;
    }

    this.currentIndex.update((index) => index + 1);
    this.saveError.set('');
  }

  private addNextQuestion(): void {
    this.questions.update((questions) => [
      ...questions,
      {
        id: this.nextQuestionId,
        content: '',
        image: null,
        answers: [this.blankAnswer()],
      },
    ]);
    this.nextQuestionId += 1;
    this.nextAnswerId += 1;
    this.currentIndex.update((index) => index + 1);
    this.saveError.set('');
  }

  saveQuiz(): void {
    if (!this.authService.isLoggedIn()) {
      this.showAuthPrompt.set(true);
      return;
    }

    if (!this.canSave()) {
      return;
    }

    if (this.rankingProtected() && this.rankingSignature() !== this.initialRankingSignature) {
      this.pendingRankingCopyAction = null;
      this.showRankingCopyConfirm.set(true);
      return;
    }
    this.performSave(false);
  }

  cancelRankingCopy(): void {
    this.showRankingCopyConfirm.set(false);
    this.pendingRankingCopyAction = null;
    this.restoreRankingProtectedChanges();
  }

  confirmRankingCopy(): void {
    this.showRankingCopyConfirm.set(false);
    const action = this.pendingRankingCopyAction;
    this.pendingRankingCopyAction = null;
    action?.();
    this.performSave(true);
  }

  private performSave(createCopy: boolean): void {
    this.isSaving.set(true);
    this.saveError.set('');

    const quizId = this.editingQuizId();
    const dto = this.buildCreateDto();

    if (quizId && !this.hasUnsavedChanges()) {
      this.quizSaved = true;
      this.isSaving.set(false);
      void this.router.navigate(['/']);
      return;
    }

    const saveRequest = createCopy && quizId ? this.quizApiService.forkQuiz(quizId, dto) : quizId ? this.quizApiService.updateQuiz(quizId, dto) : this.quizApiService.createQuiz(dto);

    saveRequest.pipe(finalize(() => this.isSaving.set(false))).subscribe({
      next: () => {
        this.quizSaved = true;
        void this.router.navigate(['/']);
      },
      error: () => {
        this.saveError.set('Nie udało się zapisać quizu.');
      },
    });
  }

  private prepareNewQuiz(): void {
    this.editingQuizId.set(null);
    this.rankingProtected.set(false);
    this.pendingRankingCopyAction = null;
    this.showAuthPrompt.set(!this.authService.isLoggedIn());
    this.initialDraftSignature = '';
    this.initialDraft = null;
    this.quizSaved = false;
    this.isLoadingQuiz.set(false);
    this.loadError.set('');
    this.saveError.set('');
    this.title.set('');
    this.scoring.set({ ...NEW_QUIZ_SCORING });
    this.rememberedPointPenalty = NEW_QUIZ_SCORING.incorrectPenalty;
    this.rememberedPercentPenalty = 50;
    this.stashedScoring = null;
    this.limits.set({ ...DEFAULT_QUIZ_LIMITS });
    this.useDefaultPointsLook.set(true);
    this.questions.set([
      {
        id: 1,
        content: '',
        image: null,
        answers: [{ id: 1, content: '', correct: false, points: null }],
      },
    ]);
    this.currentIndex.set(0);
    this.recalculateNextIds();
  }

  private loadQuizForEdit(quizId: number): void {
    this.editingQuizId.set(quizId);
    this.pendingRankingCopyAction = null;
    this.quizSaved = false;
    this.isLoadingQuiz.set(true);
    this.loadError.set('');
    this.saveError.set('');

    this.quizApiService
      .getQuizById(quizId)
      .pipe(finalize(() => this.isLoadingQuiz.set(false)))
      .subscribe({
        next: (quiz) => this.populateDraftFromQuiz(quiz),
        error: () => {
          this.loadError.set('Nie udało się pobrać quizu.');
        },
      });
  }

  private populateDraftFromQuiz(quiz: QuizPlayDTO): void {
    const questions = quiz.questions.map((question, questionIndex) => ({
      id: question.id || questionIndex + 1,
      content: question.content,
      image: question.image ?? null,
      answers: question.answers.map((answer, answerIndex) => ({
        id: answer.id || answerIndex + 1,
        content: answer.content,
        correct: answer.correct,
        points: typeof answer.points === 'number' && Number.isFinite(answer.points) ? answer.points : null,
      })),
    }));

    const loadedScoring = normalizeQuizScoring(quiz.scoring);
    const scoring =
      loadedScoring.mode === 'default' && loadedScoring.penaltyMode === 'fraction' && !this.isPlainDefaultPoints(loadedScoring)
        ? { ...loadedScoring, penaltyMode: 'points' as const }
        : loadedScoring;

    this.title.set(quiz.title);
    this.scoring.set(scoring);
    this.syncRememberedPenalties(scoring);
    this.stashedScoring = null;
    this.limits.set(normalizeQuizLimits(quiz.limits));
    this.useDefaultPointsLook.set(this.isPlainDefaultPoints(scoring));
    this.questions.set(
      questions.length > 0
        ? questions
        : [
            {
              id: 1,
              content: '',
              image: null,
              answers: [{ id: 1, content: '', correct: false, points: null }],
            },
          ],
    );
    this.currentIndex.set(this.questions().length - 1);
    this.recalculateNextIds();
    this.initialDraftSignature = this.getDraftSignature();
    this.rankingProtected.set(quiz.rankingProtected === true);
    this.initialRankingSignature = this.rankingSignature();
    this.initialDraft = {
      title: this.title(),
      questions: this.cloneQuestions(this.questions()),
      scoring: { ...this.scoring() },
      limits: { ...this.limits() },
    };
  }

  private recalculateNextIds(): void {
    this.nextQuestionId = Math.max(0, ...this.questions().map((question) => question.id)) + 1;
    this.nextAnswerId =
      Math.max(0, ...this.questions().flatMap((question) => question.answers.map((answer) => answer.id))) + 1;
  }

  private cloneQuestions(questions: DraftQuestion[]): DraftQuestion[] {
    return questions.map((question) => ({
      ...question,
      answers: question.answers.map((answer) => ({ ...answer })),
    }));
  }

  private updateCurrentQuestionAnswers(updateAnswers: (answers: DraftAnswer[]) => DraftAnswer[]): void {
    const currentQuestion = this.currentQuestion();

    if (!currentQuestion) {
      return;
    }

    this.questions.update((questions) =>
      questions.map((question) =>
        question.id === currentQuestion.id ? { ...question, answers: updateAnswers(question.answers) } : question,
      ),
    );
    this.saveError.set('');
  }

  private requestRankingCopyForAction(action: () => void): void {
    if (!this.rankingProtected()) {
      action();
      return;
    }

    this.pendingRankingCopyAction = action;
    this.showRankingCopyConfirm.set(true);
  }

  private restoreRankingProtectedChanges(): void {
    if (!this.rankingProtected() || !this.initialDraft) {
      return;
    }

    // Tytuł oraz ustawienia sposobu wyświetlania pytań są bezpieczne dla
    // wspólnego rankingu, dlatego przy anulowaniu zostają bez zmian.
    this.questions.set(this.cloneQuestions(this.initialDraft.questions));
    this.scoring.set({ ...this.initialDraft.scoring });
    this.syncRememberedPenalties(this.initialDraft.scoring);
    this.stashedScoring = null;
    this.useDefaultPointsLook.set(this.isPlainDefaultPoints(this.initialDraft.scoring));
    this.currentIndex.update((index) => Math.min(index, this.questions().length - 1));
    this.recalculateNextIds();
    this.saveError.set('');
  }

  private getExitDecision(): Promise<boolean> {
    if (!this.exitDecisionPromise) {
      this.exitDecisionPromise = new Promise<boolean>((resolve) => {
        this.exitDecision = resolve;
      });
    }

    return this.exitDecisionPromise;
  }

  private resolveExitDecision(canLeave: boolean): void {
    this.exitDecision?.(canLeave);
    this.exitDecision = null;
    this.exitDecisionPromise = null;
  }

  private hasUnsavedChanges(): boolean {
    if (this.isLoadingQuiz()) {
      return false;
    }

    if (this.isEditMode()) {
      return this.getDraftSignature() !== this.initialDraftSignature;
    }

    const scoringChanged = JSON.stringify(this.scoring()) !== JSON.stringify(NEW_QUIZ_SCORING);
    const limitsChanged = JSON.stringify(this.limits()) !== JSON.stringify(DEFAULT_QUIZ_LIMITS);

    return (
      scoringChanged ||
      limitsChanged ||
      this.title().trim().length > 0 ||
      this.questions().some(
        (question) =>
          question.content.trim().length > 0 ||
          question.image ||
          question.answers.some((answer) => answer.content.trim().length > 0 || answer.points !== null),
      )
    );
  }

  private rankingSignature(): string {
    return JSON.stringify({ questions: this.questions(), scoring: this.scoring() });
  }

  private isQuestionReady(question: DraftQuestion): boolean {
    return (
      question.content.trim().length > 0 &&
      question.answers.length > 0 &&
      question.answers.every(
        (answer) =>
          answer.content.trim().length > 0 &&
          (!this.usesCustomPoints() || (typeof answer.points === 'number' && Number.isFinite(answer.points))),
      )
    );
  }

  private buildCreateDto(): QuizCreateDTO {
    const scoring = this.scoring();

    return {
      title: this.title().trim(),
      scoring,
      limits: this.limits(),
      questions: this.questions().map((question) => ({
        content: question.content.trim(),
        image: question.image,
        answers: question.answers.map((answer) => ({
          content: answer.content.trim(),
          correct: answer.correct,
          points: typeof answer.points === 'number' && Number.isFinite(answer.points) ? answer.points : null,
        })),
      })),
    };
  }

  private scoringForOpenControls(scoring: QuizScoring): QuizScoring {
    if (scoring.mode === 'custom') {
      return { ...scoring, penaltyMode: scoring.penaltyMode === 'percent' ? 'percent' : 'points' };
    }

    if (scoring.penaltyMode === 'percent') {
      return { ...scoring, mode: 'default', penaltyMode: 'percent' };
    }

    return { ...scoring, mode: 'default', penaltyMode: 'points' };
  }

  private isPlainDefaultPoints(scoring: QuizScoring): boolean {
    return (
      scoring.mode === 'default' &&
      scoring.penaltyMode === 'fraction' &&
      scoring.pointsPerCorrect === NEW_QUIZ_SCORING.pointsPerCorrect &&
      scoring.incorrectPenalty === NEW_QUIZ_SCORING.incorrectPenalty
    );
  }

  private blankAnswer(): DraftAnswer {
    const scoring = this.scoring();

    return {
      id: this.nextAnswerId,
      content: '',
      correct: false,
      points: scoring.mode === 'custom' ? this.fixedWrongPoints(scoring) : null,
    };
  }

  private fixedWrongPoints(scoring: QuizScoring): number {
    const magnitude = scoring.penaltyMode === 'percent' ? this.rememberedPointPenalty : scoring.incorrectPenalty;
    return -Math.max(0, magnitude);
  }

  private syncRememberedPenalties(scoring: QuizScoring): void {
    if (scoring.penaltyMode === 'percent') {
      this.rememberedPercentPenalty = scoring.incorrectPenalty;
      return;
    }

    if (scoring.penaltyMode === 'points') {
      this.rememberedPointPenalty = scoring.incorrectPenalty;
    }
  }

  private applySharedPoints(nextPoints: (answer: DraftAnswer) => number | null): void {
    if (this.scoring().mode !== 'custom') {
      return;
    }

    this.questions.update((questions) =>
      questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer, points: nextPoints(answer) })),
      })),
    );
  }

  private suggestedPoints(answer: DraftAnswer, scoring: QuizScoring): number {
    if (typeof answer.points === 'number' && Number.isFinite(answer.points)) {
      return answer.points;
    }

    if (answer.correct) {
      return scoring.pointsPerCorrect;
    }

    return this.fixedWrongPoints(scoring);
  }

  private readBoundedScoreInput(event: Event, min: number, max: number): number | null {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    const allowNegative = min < 0;

    if (value === '' || (allowNegative && (value === '-' || value === '-0' || value === '-0.' || value === '-0,'))) {
      return null;
    }

    const match = value.match(/^(-?)(\d+)([.,]?)(\d*)$/);
    if (!match || (!allowNegative && match[1] === '-')) {
      input.value = '';
      return null;
    }

    const [, sign, wholePart, separator, decimalPart] = match;
    if (wholePart.length > 1 && wholePart.startsWith('0')) {
      input.value = `${sign}0${separator}${decimalPart}`;
      return this.readBoundedScoreInput(event, min, max);
    }

    if (allowNegative && sign === '' && wholePart === '0' && separator !== '') {
      input.value = '0';
      return 0;
    }

    if (separator !== '' && decimalPart.length === 0) {
      return null;
    }

    const limitedDecimalPart = decimalPart.slice(0, 2);
    if (decimalPart.length > 2) {
      input.value = `${sign}${wholePart}${separator}${limitedDecimalPart}`;
    }

    const parsed = Number(`${sign}${wholePart}${separator === ',' ? '.' : separator}${limitedDecimalPart}`);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    const bounded = this.clampScoreValue(parsed, min, max);

    if (bounded !== parsed) {
      input.value = separator === ',' ? bounded.toString().replace('.', ',') : bounded.toString();
    }

    this.restoreScoreInputText(input);
    return bounded;
  }

  private restoreScoreInputText(input: HTMLInputElement): void {
    const value = input.value;
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    const previousTimer = this.scoreInputRestoreTimers.get(input);

    if (previousTimer !== undefined) {
      clearTimeout(previousTimer);
    }

    const timer = setTimeout(() => {
      if (!input.isConnected) {
        return;
      }

      input.value = value;

      if (selectionStart !== null && selectionEnd !== null) {
        input.setSelectionRange(selectionStart, selectionEnd);
      }
    }, 0);

    this.scoreInputRestoreTimers.set(input, timer);
  }

  private clampScoreValue(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.trunc(value * 100) / 100));
  }

  private getDraftSignature(): string {
    return JSON.stringify(this.buildCreateDto());
  }
}
