import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
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

  model = { email: '', password: '', passwordConfirm: '', displayName: '' };
  readonly passwordMismatch = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  onSubmit(): void {
    if (this.model.password !== this.model.passwordConfirm) {
      this.passwordMismatch.set(true);
      this.error.set(null);
      return;
    }

    if (!this.model.email || !this.model.password || !this.model.displayName) {
      this.error.set('Wypełnij wszystkie pola');
      this.passwordMismatch.set(false);
      return;
    }

    this.passwordMismatch.set(false);
    this.loading.set(true);
    this.error.set(null);

    this.authService
      .register(this.model.email, this.model.password, this.model.displayName)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.authService.setCurrentUser(response);
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Błąd rejestracji');
        },
      });
  }
}
