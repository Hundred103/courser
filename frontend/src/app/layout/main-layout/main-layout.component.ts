import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HomePageComponent } from '../../features/home/home-page.component';
import { QuizCreatePageComponent } from '../../features/quiz-create/quiz-create-page.component';
import { QuizPlayPageComponent } from '../../features/quiz-play/quiz-play-page.component';
import { NavbarComponent } from '../navbar/navbar.component';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.css',
})
export class MainLayoutComponent {
  private readonly router = inject(Router);

  readonly activePage = signal<unknown>(null);
  readonly isHome = computed(() => this.activePage() instanceof HomePageComponent);
  readonly editor = computed(() => {
    const page = this.activePage();
    return page instanceof QuizCreatePageComponent ? page : null;
  });

  requestCreateQuiz(): void {
    const page = this.activePage();
    if (page instanceof HomePageComponent) page.requestCreateQuiz();
  }

  requestHome(): void {
    const page = this.activePage();
    if (page instanceof QuizCreatePageComponent || page instanceof QuizPlayPageComponent) {
      page.requestExitQuiz();
      return;
    }
    void this.router.navigateByUrl('/');
  }
}
