import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { UNLIMITED_QUIZ_LIMITS, QuizLimits, normalizeQuizLimits, quizLimitsError } from '../../core/models/quiz-limits.model';
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
  penaltyMode: 'points',
};

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
  private exitDecision: ((canLeave: boolean) => void) | null = null;
  private exitDecisionPromise: Promise<boolean> | null = null;
  private quizSaved = false;
  private initialDraftSignature = '';
  private initialDraft: DraftSnapshot | null = null;

  readonly title = signal('');
  readonly scoring = signal<QuizScoring>({ ...NEW_QUIZ_SCORING });
  readonly limits = signal<QuizLimits>({ ...UNLIMITED_QUIZ_LIMITS });
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

  readonly isEditMode = computed(() => this.editingQuizId() !== null);
  readonly usesCustomPoints = computed(() => this.scoring().mode === 'custom');
  readonly showPointControls = computed(() => !this.useDefaultPointsLook());
  readonly wrongAnswerPoints = computed(() => -this.scoring().incorrectPenalty);
  readonly limitsError = computed(() => quizLimitsError(this.limits(), this.questions().length));
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

    return hasTitle && hasValidQuestions && !this.limitsError() && !this.isSaving() && !this.isLoadingQuiz();
  });
  readonly saveButtonTitle = computed(() => {
    if (this.limitsError()) {
      return this.limitsError();
    }

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
    this.useDefaultPointsLook.set((event.target as HTMLInputElement).checked);
  }

  togglePerAnswerPoints(event: Event): void {
    const usePerAnswerPoints = (event.target as HTMLInputElement).checked;

    if (!usePerAnswerPoints) {
      this.scoring.update((scoring) => ({ ...scoring, mode: 'default', penaltyMode: 'points' }));
      this.saveError.set('');
      return;
    }

    const current = { ...this.scoring(), penaltyMode: 'points' as const };
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

  updateLimit(field: 'maxAttempts' | 'quizTimeSeconds' | 'questionTimeSeconds', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();

    if (raw === '') {
      this.limits.update((limits) => ({ ...limits, [field]: null }));
      this.saveError.set('');
      return;
    }

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return;
    }

    this.limits.update((limits) => ({ ...limits, [field]: parsed }));
    this.saveError.set('');
  }

  toggleAllowNegative(event: Event): void {
    const allowNegativeScore = (event.target as HTMLInputElement).checked;
    this.scoring.update((scoring) => ({ ...scoring, allowNegativeScore }));
    this.saveError.set('');
  }

  updateCorrectAnswerPoints(event: Event): void {
    const parsed = this.readInputNumber((event.target as HTMLInputElement).value);

    if (parsed === null) {
      return;
    }

    const pointsPerCorrect = Math.max(0, parsed);
    this.scoring.update((scoring) => ({ ...scoring, penaltyMode: 'points', pointsPerCorrect }));
    this.applySharedPoints((answer) => (answer.correct ? pointsPerCorrect : answer.points));
    this.saveError.set('');
  }

  updateWrongAnswerPoints(event: Event): void {
    const parsed = this.readInputNumber((event.target as HTMLInputElement).value);

    if (parsed === null) {
      return;
    }

    const wrongPoints = Math.min(0, parsed);
    const incorrectPenalty = -wrongPoints;
    this.scoring.update((scoring) => ({ ...scoring, penaltyMode: 'points', incorrectPenalty }));
    this.applySharedPoints((answer) => (answer.correct ? answer.points : wrongPoints));
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
      this.questions.update((questions) =>
        questions.map((question) => (question.id === currentQuestion.id ? { ...question, image } : question)),
      );
      this.saveError.set('');
    } catch {
      this.saveError.set('Nie udało się przetworzyć obrazu.');
    }
  }

  removeQuestionImage(): void {
    const currentQuestion = this.currentQuestion();

    if (!currentQuestion) {
      return;
    }

    this.questions.update((questions) =>
      questions.map((question) => (question.id === currentQuestion.id ? { ...question, image: null } : question)),
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
    const correct = (event.target as HTMLInputElement).checked;
    const scoring = this.scoring();
    const rightPoints = scoring.pointsPerCorrect;
    const wrongPoints = -scoring.incorrectPenalty;

    this.updateCurrentQuestionAnswers((answers) =>
      answers.map((answer) => {
        if (answer.id !== answerId) {
          return answer;
        }

        if (scoring.mode !== 'custom') {
          return { ...answer, correct };
        }

        const stillShared = answer.points === null || answer.points === rightPoints || answer.points === wrongPoints;

        return {
          ...answer,
          correct,
          points: stillShared ? (correct ? rightPoints : wrongPoints) : answer.points,
        };
      }),
    );
  }

  updateAnswerPoints(answerId: number, event: Event): void {
    const parsed = this.readInputNumber((event.target as HTMLInputElement).value);

    if (parsed === null) {
      return;
    }

    this.updateCurrentQuestionAnswers((answers) =>
      answers.map((answer) => (answer.id === answerId ? { ...answer, points: parsed } : answer)),
    );
  }

  addAnswer(): void {
    const answer = this.blankAnswer();

    this.nextAnswerId += 1;
    this.updateCurrentQuestionAnswers((answers) => [...answers, answer]);
  }

  removeAnswer(answerId: number): void {
    this.updateCurrentQuestionAnswers((answers) => {
      if (answers.length <= 1) {
        return answers;
      }

      return answers.filter((answer) => answer.id !== answerId);
    });
  }

  removeCurrentQuestion(): void {
    const currentQuestion = this.currentQuestion();

    if (!currentQuestion || this.totalQuestions() <= 1) {
      return;
    }

    this.questions.update((questions) => questions.filter((question) => question.id !== currentQuestion.id));
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
    }

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

    const saveRequest = quizId ? this.quizApiService.updateQuiz(quizId, dto) : this.quizApiService.createQuiz(dto);

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
    this.showAuthPrompt.set(!this.authService.isLoggedIn());
    this.initialDraftSignature = '';
    this.initialDraft = null;
    this.quizSaved = false;
    this.isLoadingQuiz.set(false);
    this.loadError.set('');
    this.saveError.set('');
    this.title.set('');
    this.scoring.set({ ...NEW_QUIZ_SCORING });
    this.limits.set({ ...UNLIMITED_QUIZ_LIMITS });
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

    const scoring = normalizeQuizScoring(quiz.scoring);

    this.title.set(quiz.title);
    this.scoring.set(scoring);
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
    const limitsChanged = JSON.stringify(this.limits()) !== JSON.stringify(UNLIMITED_QUIZ_LIMITS);

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

  private isPlainDefaultPoints(scoring: QuizScoring): boolean {
    return (
      scoring.mode === 'default' &&
      scoring.penaltyMode === 'points' &&
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
      points: scoring.mode === 'custom' ? -scoring.incorrectPenalty : null,
    };
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

    return -scoring.incorrectPenalty;
  }

  private readInputNumber(value: string): number | null {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getDraftSignature(): string {
    return JSON.stringify(this.buildCreateDto());
  }
}
