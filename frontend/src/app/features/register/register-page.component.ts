import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.css'],
})
export class RegisterPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  model = { email: '', password: '', passwordConfirm: '', username: '' };
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);
  readonly submitAttempted = signal(false);

  onSubmit(): void {
    this.submitAttempted.set(true);
    this.error.set(null);

    if (this.emailError() || this.usernameError() || !this.isPasswordValid() || !this.passwordsMatch()) {
      return;
    }

    this.loading.set(true);

    this.authService
      .register(this.model.email.trim(), this.model.password, this.model.username.trim())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.authService.setCurrentUser(response);
          this.authService.migrateGuestQuizzesToUser(response).subscribe({
            next: () => {
              this.router.navigate(['/']);
            },
            error: () => {
              this.error.set('Konto utworzone, ale nie udało się przenieść lokalnych quizów.');
            },
          });
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Błąd rejestracji');
        },
      });
  }

  emailError(): string | null {
    if (!this.submitAttempted()) {
      return null;
    }

    const email = this.model.email.trim();

    if (!email) {
      return 'Podaj adres e-mail.';
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return 'Adres e-mail musi mieć poprawny format, np. nazwa@domena.pl.';
    }

    return null;
  }

  usernameError(): string | null {
    const username = this.model.username;

    if (!this.submitAttempted() && !username) {
      return null;
    }

    if (!username.trim()) {
      return 'Podaj nazwę użytkownika.';
    }

    if (/\s/.test(username)) {
      return 'Nazwa użytkownika musi być jednym ciągiem bez spacji.';
    }

    if (!/^[A-Za-z0-9]+$/.test(username)) {
      return 'Użyj tylko liter bez polskich znaków i cyfr.';
    }

    return null;
  }

  hasRequiredLength(): boolean {
    return this.model.password.length >= 8;
  }

  hasDigit(): boolean {
    return /\d/.test(this.model.password);
  }

  hasSpecialCharacter(): boolean {
    return /[^A-Za-z0-9]/.test(this.model.password);
  }

  isPasswordValid(): boolean {
    return this.hasRequiredLength() && this.hasDigit() && this.hasSpecialCharacter();
  }

  passwordsMatch(): boolean {
    return !!this.model.passwordConfirm && this.model.password === this.model.passwordConfirm;
  }
}
