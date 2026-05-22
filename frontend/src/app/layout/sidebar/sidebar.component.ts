import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith } from 'rxjs';
import { QuizRawDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';

type QuizSidebarState =
  | { status: 'loading'; quizzes: QuizRawDTO[]; errorMessage: '' }
  | { status: 'ready'; quizzes: QuizRawDTO[]; errorMessage: '' }
  | { status: 'error'; quizzes: QuizRawDTO[]; errorMessage: string };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent {
  private readonly quizApiService = inject(QuizApiService);

  private readonly quizState = toSignal(
    this.quizApiService.getAllQuizzes().pipe(
      map((quizzes): QuizSidebarState => ({
        status: 'ready',
        quizzes,
        errorMessage: '',
      })),
      startWith({
        status: 'loading',
        quizzes: [],
        errorMessage: '',
      } satisfies QuizSidebarState),
      catchError(() =>
        of({
          status: 'error',
          quizzes: [],
          errorMessage: 'Nie udalo sie pobrac listy quizow.',
        } satisfies QuizSidebarState),
      ),
    ),
    {
      initialValue: {
        status: 'loading',
        quizzes: [],
        errorMessage: '',
      } satisfies QuizSidebarState,
    },
  );

  readonly quizzes = computed(() => this.quizState().quizzes);
  readonly isLoading = computed(() => this.quizState().status === 'loading');
  readonly errorMessage = computed(() => this.quizState().errorMessage);
  readonly hasQuizzes = computed(() => this.quizzes().length > 0);
}
