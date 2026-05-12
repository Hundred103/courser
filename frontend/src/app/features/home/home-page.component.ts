import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize, Subject, takeUntil } from 'rxjs';
import { QuizRawDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
})
export class HomePageComponent implements OnInit, OnDestroy {
  private readonly quizApiService = inject(QuizApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  quizzes: QuizRawDTO[] = [];
  isLoading = true;
  errorMessage = '';

  ngOnInit(): void {
    this.quizApiService
      .getAllQuizzes()
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (data: QuizRawDTO[]) => {
          this.quizzes = data;
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.errorMessage = 'Nie udalo sie pobrac listy quizow.';
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
