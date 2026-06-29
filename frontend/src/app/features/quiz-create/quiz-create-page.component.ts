import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { QuizCreateDTO, QuizPlayDTO } from '../../core/models/quiz.model';
import { AuthService } from '../../core/services/auth.service';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { compressImageFile, toImageSrc } from '../../core/utils/image-compression.util';

interface DraftAnswer {
  id: number;
  content: string;
  correct: boolean;
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
  readonly questions = signal<DraftQuestion[]>([
    {
      id: 1,
      content: '',
      image: null,
      answers: [{ id: 1, content: '', correct: false }],
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
  readonly saveButtonTitle = computed(() =>
    this.canSave() ? '' : 'Pola tytuł, pytanie i odpowiedź muszą być wypełnione',
  );

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
    this.updateCurrentQuestionAnswers((answers) =>
      answers.map((answer) => (answer.id === answerId ? { ...answer, correct } : answer)),
    );
  }

  addAnswer(): void {
    const answer: DraftAnswer = {
      id: this.nextAnswerId,
      content: '',
      correct: false,
    };

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
          answers: [{ id: this.nextAnswerId, content: '', correct: false }],
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
    this.questions.set([
      {
        id: 1,
        content: '',
        image: null,
        answers: [{ id: 1, content: '', correct: false }],
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
      })),
    }));

    this.title.set(quiz.title);
    this.questions.set(
      questions.length > 0
        ? questions
        : [
            {
              id: 1,
              content: '',
              image: null,
              answers: [{ id: 1, content: '', correct: false }],
            },
          ],
    );
    this.currentIndex.set(this.questions().length - 1);
    this.recalculateNextIds();
    this.initialDraftSignature = this.getDraftSignature();
    this.initialDraft = {
      title: this.title(),
      questions: this.cloneQuestions(this.questions()),
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

    return (
      this.title().trim().length > 0 ||
      this.questions().some(
        (question) =>
          question.content.trim().length > 0 ||
          question.image ||
          question.answers.some((answer) => answer.content.trim().length > 0),
      )
    );
  }

  private isQuestionReady(question: DraftQuestion): boolean {
    return (
      question.content.trim().length > 0 &&
      question.answers.length > 0 &&
      question.answers.every((answer) => answer.content.trim().length > 0)
    );
  }

  private buildCreateDto(): QuizCreateDTO {
    return {
      title: this.title().trim(),
      questions: this.questions().map((question) => ({
        content: question.content.trim(),
        image: question.image,
        answers: question.answers.map((answer) => ({
          content: answer.content.trim(),
          correct: answer.correct,
        })),
      })),
    };
  }

  private getDraftSignature(): string {
    return JSON.stringify(this.buildCreateDto());
  }
}
