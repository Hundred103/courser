import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css'],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  model = { username: '', password: '' };
  error: string | null = null;
  loading = false;

  onSubmit(): void {
    if (!this.model.username || !this.model.password) {
      this.error = 'Wpisz email i hasło';
      return;
    }

    this.loading = true;
    this.error = null;

    this.authService.login(this.model.username, this.model.password).subscribe({
      next: (response) => {
        this.authService.setCurrentUser(response);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.error = err.error?.error || 'Błąd logowania';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
