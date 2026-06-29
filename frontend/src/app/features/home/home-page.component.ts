import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.css',
})
export class HomePageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly showAuthPrompt = signal(false);

  requestCreateQuiz(): void {
    if (!this.authService.isLoggedIn()) {
      this.showAuthPrompt.set(true);
      return;
    }

    void this.router.navigate(['/quizzes/new']);
  }

  cancelAuthPrompt(): void {
    this.showAuthPrompt.set(false);
  }

  goToLogin(): void {
    this.showAuthPrompt.set(false);
    void this.router.navigate(['/login']);
  }
}
