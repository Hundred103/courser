import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { QuizCreateDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';

interface DraftAnswer {
  id: number;
  content: string;
  correct: boolean;
}

interface DraftQuestion {
  id: number;
  content: string;
  answers: DraftAnswer[];
}

@Component({
  selector: 'app-quiz-create-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './quiz-create-page.component.html',
  styleUrl: './quiz-create-page.component.css',
})
export class QuizCreatePageComponent {
  private readonly quizApiService = inject(QuizApiService);
  private readonly router = inject(Router);
  private nextQuestionId = 2;
  private nextAnswerId = 2;
  private exitDecision: ((canLeave: boolean) => void) | null = null;
  private exitDecisionPromise: Promise<boolean> | null = null;
  private quizSaved = false;

  readonly title = signal('');
  readonly questions = signal<DraftQuestion[]>([
    {
      id: 1,
      content: '',
      answers: [{ id: 1, content: '', correct: false }],
    },
  ]);
  readonly currentIndex = signal(0);
  readonly isSaving = signal(false);
  readonly saveError = signal('');
  readonly showExitConfirm = signal(false);

  readonly totalQuestions = computed(() => this.questions().length);
  readonly currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  readonly currentQuestionNumber = computed(() => this.currentIndex() + 1);
  readonly canGoPrevious = computed(() => this.currentIndex() > 0);
  readonly canSave = computed(() => {
    const hasTitle = this.title().trim().length > 0;
    const hasValidQuestions = this.questions().every((question) => this.isQuestionReady(question));

    return hasTitle && hasValidQuestions && !this.isSaving();
  });
  readonly saveButtonTitle = computed(() =>
    this.canSave() ? '' : 'Pola tytuł, pytanie i odpowiedź muszą być wypełnione',
  );

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

  canDeactivate(): boolean | Promise<boolean> {
    if (this.quizSaved || !this.hasDraftContent()) {
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
    if (!this.canSave()) {
      return;
    }

    this.isSaving.set(true);
    this.saveError.set('');

    this.quizApiService
      .createQuiz(this.buildCreateDto())
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.quizSaved = true;
          void this.router.navigate(['/']);
        },
        error: () => {
          this.saveError.set('Nie udało się zapisać quizu.');
        },
      });
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

  private hasDraftContent(): boolean {
    return (
      this.title().trim().length > 0 ||
      this.questions().some(
        (question) =>
          question.content.trim().length > 0 ||
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
        answers: question.answers.map((answer) => ({
          content: answer.content.trim(),
          correct: answer.correct,
        })),
      })),
    };
  }
}
