import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.user;
  readonly isLoggedIn = this.authService.isLoggedIn;

  onSettingsClick(): void {
    // TODO: add settings logic
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
