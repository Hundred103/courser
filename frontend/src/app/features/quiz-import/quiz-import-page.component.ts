import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { QuizCreateDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { buildQuizZip, parseQuizZip } from '../../core/utils/quiz-zip.util';

const QUIZ_TEMPLATE: QuizCreateDTO = {
  title: 'Przykładowy quiz',
  questions: [
    {
      content: 'Która odpowiedź jest poprawna?',
      image: null,
      answers: [
        {
          content: 'Pierwsza odpowiedź',
          correct: true,
        },
        {
          content: 'Druga odpowiedź',
          correct: false,
        },
      ],
    },
  ],
};

@Component({
  selector: 'app-quiz-import-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './quiz-import-page.component.html',
  styleUrl: './quiz-import-page.component.css',
})
export class QuizImportPageComponent {
  private readonly quizApiService = inject(QuizApiService);
  private readonly router = inject(Router);

  readonly selectedFileName = signal('');
  readonly activeTab = signal<'file' | 'code'>('file');
  readonly importedQuiz = signal<QuizCreateDTO | null>(null);
  readonly validationError = signal('');
  readonly importError = signal('');
  readonly isReadingFile = signal(false);
  readonly isImporting = signal(false);
  readonly isDraggingFile = signal(false);
  readonly shareCode = signal('');
  readonly codeImportError = signal('');
  readonly isCodeImporting = signal(false);
  readonly templateJson = JSON.stringify(
    {
      title: QUIZ_TEMPLATE.title,
      questions: QUIZ_TEMPLATE.questions.map((question) => ({
        content: question.content,
        image: question.image,
        answers: question.answers,
      })),
    },
    null,
    2,
  );

  readonly canImport = computed(() => this.importedQuiz() !== null && !this.validationError() && !this.isImporting());
  readonly questionCount = computed(() => this.importedQuiz()?.questions.length ?? 0);
  readonly canImportByCode = computed(() => this.normalizeShareCode(this.shareCode()).length === 10 && !this.isCodeImporting());

  showFileTab(): void {
    this.activeTab.set('file');
  }

  showCodeTab(): void {
    this.activeTab.set('code');
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) {
      void this.readQuizFile(file);
    }

    input.value = '';
  }

  handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFile.set(true);
  }

  handleDragLeave(event: DragEvent): void {
    if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
      return;
    }

    this.isDraggingFile.set(false);
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingFile.set(false);

    const file = event.dataTransfer?.files?.[0];

    if (file) {
      void this.readQuizFile(file);
    }
  }

  async downloadTemplate(): Promise<void> {
    const blob = await buildQuizZip(QUIZ_TEMPLATE);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'quiz-template.zip';
    link.click();
    URL.revokeObjectURL(url);
  }

  removeSelectedQuiz(): void {
    if (this.isImporting()) {
      return;
    }

    this.selectedFileName.set('');
    this.importedQuiz.set(null);
    this.validationError.set('');
    this.importError.set('');
    this.isDraggingFile.set(false);
  }

  importQuiz(): void {
    const quiz = this.importedQuiz();

    if (!quiz || !this.canImport()) {
      return;
    }

    this.isImporting.set(true);
    this.importError.set('');

    this.quizApiService
      .importQuiz(quiz)
      .pipe(finalize(() => this.isImporting.set(false)))
      .subscribe({
        next: (createdQuiz) => {
          void this.router.navigate(['/quizzes', createdQuiz.id, 'details'], {
            queryParams: { imported: 'true' },
          });
        },
        error: () => {
          this.importError.set('Nie udało się zaimportować quizu. Spróbuj ponownie.');
        },
      });
  }

  updateShareCode(value: string): void {
    this.shareCode.set(value.toUpperCase());
    this.codeImportError.set('');
  }

  importQuizByCode(): void {
    const code = this.normalizeShareCode(this.shareCode());

    if (code.length !== 10 || this.isCodeImporting()) {
      this.codeImportError.set('Wpisz poprawny kod udostępniania.');
      return;
    }

    this.isCodeImporting.set(true);
    this.codeImportError.set('');

    this.quizApiService
      .importQuizByCode(code)
      .pipe(finalize(() => this.isCodeImporting.set(false)))
      .subscribe({
        next: (createdQuiz) => {
          void this.router.navigate(['/quizzes', createdQuiz.id, 'details'], {
            queryParams: { imported: 'true' },
          });
        },
        error: () => {
          this.codeImportError.set('Nie udało się dodać quizu. Sprawdź kod i spróbuj ponownie.');
        },
      });
  }

  private async readQuizFile(file: File): Promise<void> {
    this.selectedFileName.set(file.name);
    this.importedQuiz.set(null);
    this.validationError.set('');
    this.importError.set('');

    const lowerName = file.name.toLowerCase();

    if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.json')) {
      this.validationError.set('Wybierz plik .zip albo .json.');
      return;
    }

    this.isReadingFile.set(true);

    try {
      if (lowerName.endsWith('.zip')) {
        const buffer = await file.arrayBuffer();
        this.importedQuiz.set(await parseQuizZip(buffer));
      } else {
        const rawJson = await file.text();
        this.importedQuiz.set(this.parseJsonQuiz(rawJson));
      }
    } catch (error) {
      this.importedQuiz.set(null);
      this.validationError.set(error instanceof Error ? error.message : 'Nie udało się odczytać pliku.');
    } finally {
      this.isReadingFile.set(false);
    }
  }

  private parseJsonQuiz(rawJson: string): QuizCreateDTO {
    const parsed = JSON.parse(rawJson) as unknown;
    return this.normalizeQuiz(parsed);
  }

  private normalizeQuiz(value: unknown): QuizCreateDTO {
    if (!this.isRecord(value)) {
      throw new Error('Główny obiekt musi zawierać pola title oraz questions.');
    }

    if (typeof value['title'] !== 'string' || value['title'].trim().length === 0) {
      throw new Error('Pole title musi być niepustym tekstem.');
    }

    if (!Array.isArray(value['questions']) || value['questions'].length === 0) {
      throw new Error('Pole questions musi być niepustą tablicą.');
    }

    return {
      title: value['title'].trim(),
      questions: value['questions'].map((question, questionIndex) => this.normalizeQuestion(question, questionIndex)),
    };
  }

  private normalizeQuestion(value: unknown, questionIndex: number): QuizCreateDTO['questions'][number] {
    if (!this.isRecord(value)) {
      throw new Error(`Pytanie ${questionIndex + 1} musi być obiektem.`);
    }

    if (typeof value['content'] !== 'string' || value['content'].trim().length === 0) {
      throw new Error(`Pytanie ${questionIndex + 1} musi mieć niepuste pole content.`);
    }

    if (!Array.isArray(value['answers']) || value['answers'].length === 0) {
      throw new Error(`Pytanie ${questionIndex + 1} musi mieć co najmniej jedną odpowiedź.`);
    }

    const imageValue = value['image'];
    let image: string | null = null;

    if (imageValue !== null && imageValue !== undefined && imageValue !== '') {
      if (typeof imageValue !== 'string') {
        throw new Error(`Pole image w pytaniu ${questionIndex + 1} musi być null albo nazwą pliku.`);
      }

      image = imageValue.trim();
    }

    return {
      content: value['content'].trim(),
      image,
      answers: value['answers'].map((answer, answerIndex) =>
        this.normalizeAnswer(answer, questionIndex, answerIndex),
      ),
    };
  }

  private normalizeAnswer(
    value: unknown,
    questionIndex: number,
    answerIndex: number,
  ): QuizCreateDTO['questions'][number]['answers'][number] {
    if (!this.isRecord(value)) {
      throw new Error(`Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1} musi być obiektem.`);
    }

    if (typeof value['content'] !== 'string' || value['content'].trim().length === 0) {
      throw new Error(`Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1} musi mieć niepuste pole content.`);
    }

    if (typeof value['correct'] !== 'boolean') {
      throw new Error(`Odpowiedź ${answerIndex + 1} w pytaniu ${questionIndex + 1} musi mieć pole correct typu boolean.`);
    }

    return {
      content: value['content'].trim(),
      correct: value['correct'],
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private normalizeShareCode(code: string): string {
    return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
}
