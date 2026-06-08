import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrls: ['./register-page.component.css'],
})
export class RegisterPageComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  model = { email: '', password: '', passwordConfirm: '', displayName: '' };
  passwordMismatch = false;
  error: string | null = null;
  loading = false;

  onSubmit(): void {
    if (this.model.password !== this.model.passwordConfirm) {
      this.passwordMismatch = true;
      return;
    }
    
    if (!this.model.email || !this.model.password || !this.model.displayName) {
      this.error = 'Wypełnij wszystkie pola';
      return;
    }

    this.passwordMismatch = false;
    this.loading = true;
    this.error = null;

    this.authService.register(this.model.email, this.model.password, this.model.displayName).subscribe({
      next: (response) => {
        this.authService.setCurrentUser(response);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.error = err.error?.error || 'Błąd rejestracji';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
