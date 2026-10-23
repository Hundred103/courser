import { Component, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { QuizApiService } from '../../core/services/quiz-api.service';
import { QuizPlayDTO, RankingLeaderboardDTO } from '../../core/models/quiz.model';
import { QuestionPlayDTO } from '../../core/models/question.model';
import { toImageSrc } from '../../core/utils/image-compression.util';

@Component({
  selector: 'app-quiz-details-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './quiz-details-page.component.html',
  styleUrl: './quiz-details-page.component.css',
})
export class QuizDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly quizApi = inject(QuizApiService);

  readonly quiz = signal<QuizPlayDTO | null>(null);
  readonly isLoading = signal(true);
  readonly errorMessage = signal('');
  readonly showImportedBanner = signal(false);
  readonly ranking = signal<RankingLeaderboardDTO | null>(null);

  readonly questionCount = computed(() => this.quiz()?.questions.length ?? 0);

  // Set of expanded question indices
  readonly expandedQuestions = signal<Set<number>>(new Set());

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const imported = this.route.snapshot.queryParamMap.get('imported');
    if (imported === 'true') {
      this.showImportedBanner.set(true);
    }
    this.quizApi.getQuizById(id).subscribe({
      next: (quiz) => {
        this.quiz.set(quiz);
        this.isLoading.set(false);
        if (quiz.rankingEnabled && quiz.id > 0) {
          this.quizApi.getRankingLeaderboard(quiz.id).subscribe({
            next: (ranking) => this.ranking.set(ranking.leaderboard.length > 0 ? ranking : null),
          });
        }
      },
      error: () => {
        this.errorMessage.set('Nie udało się załadować quizu.');
        this.isLoading.set(false);
      },
    });
  }

  isExpanded(index: number): boolean {
    return this.expandedQuestions().has(index);
  }

  toggleQuestion(index: number): void {
    const current = new Set(this.expandedQuestions());
    if (current.has(index)) {
      current.delete(index);
    } else {
      current.add(index);
    }
    this.expandedQuestions.set(current);
  }

  questionImageSrc(question: QuestionPlayDTO): string | null {
    return toImageSrc(question.image);
  }

  rankingDurationText(milliseconds: number): string {
    return `${(milliseconds / 1000).toFixed(3).replace('.', ',')} s`;
  }
}
