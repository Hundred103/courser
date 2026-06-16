import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css'],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  model = { email: '', password: '' };
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  onSubmit(): void {
    if (!this.model.email || !this.model.password) {
      this.error.set('Wpisz email i hasło');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.authService
      .login(this.model.email, this.model.password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          this.authService.setCurrentUser(response);
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.error.set(err.error?.error || 'Błąd logowania');
        },
      });
  }
}
