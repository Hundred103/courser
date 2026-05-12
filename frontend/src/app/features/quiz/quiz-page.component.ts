import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, Subject, takeUntil } from 'rxjs';
import { QuizPlayDTO } from '../../core/models/quiz.model';
import { QuizApiService } from '../../core/services/quiz-api.service';

@Component({
  selector: 'app-quiz-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './quiz-page.component.html',
  styleUrl: './quiz-page.component.css',
})
export class QuizPageComponent implements OnInit, OnDestroy {
  private readonly quizApiService = inject(QuizApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  quiz: QuizPlayDTO | null = null;
  isLoading = true;
  errorMessage = '';

  selectedAnswers: Record<number, number> = {};
  resultReady = false;
  score = 0;
  totalQuestions = 0;
  scorePercent = 0;

  ngOnInit(): void {
    const quizId = Number(this.route.snapshot.paramMap.get('id'));
    if (!quizId) {
      this.isLoading = false;
      this.errorMessage = 'Niepoprawny identyfikator quizu.';
      this.cdr.markForCheck();
      return;
    }

    this.quizApiService
      .getQuizById(quizId)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (data: QuizPlayDTO) => {
          this.quiz = data;
          this.totalQuestions = data.questions.length;
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.errorMessage = 'Nie udalo sie pobrac quizu.';
        },
      });
  }

  setSelectedAnswer(questionId: number, answerId: number): void {
    this.selectedAnswers[questionId] = Number(answerId);
  }

  submitQuiz(): void {
    if (!this.quiz) {
      return;
    }

    let correctAnswers = 0;
    for (const question of this.quiz.questions) {
      const selectedAnswerId = this.selectedAnswers[question.id];
      const selected = question.answers.find((answer) => answer.id === selectedAnswerId);
      if (selected?.correct) {
        correctAnswers += 1;
      }
    }

    this.score = correctAnswers;
    this.resultReady = true;
    this.scorePercent = this.totalQuestions === 0 ? 0 : Math.round((this.score / this.totalQuestions) * 100);
    this.cdr.markForCheck();
  }

  goBack(): void {
    this.router.navigateByUrl('/');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
