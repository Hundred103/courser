import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ACCENT_OPTIONS, AccentColor, DEFAULT_ACCENT_COLOR } from '../../core/models/theme.model';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.user;
  readonly isLoggedIn = this.authService.isLoggedIn;
  readonly accentOptions = ACCENT_OPTIONS;
  readonly settingsOpen = signal(false);
  readonly accentListOpen = signal(false);
  readonly settingsSaving = signal(false);
  readonly settingsError = signal<string | null>(null);
  settingsUsername = '';
  settingsAccent: AccentColor = DEFAULT_ACCENT_COLOR;

  onSettingsClick(): void {
    const user = this.user();
    if (!user) return;

    this.settingsUsername = user.username;
    this.settingsAccent = user.accentColor;
    this.settingsError.set(null);
    this.accentListOpen.set(false);
    this.settingsOpen.set(true);
  }

  cancelSettings(): void {
    if (this.settingsSaving()) return;
    this.settingsOpen.set(false);
  }

  selectAccent(accent: AccentColor): void {
    this.settingsAccent = accent;
    this.accentListOpen.set(false);
  }

  selectedAccent() {
    return this.accentOptions.find((option) => option.id === this.settingsAccent) ?? this.accentOptions[0];
  }

  saveSettings(): void {
    if (this.settingsSaving()) return;

    const username = this.settingsUsername.trim();
    if (!username) {
      this.settingsError.set('Podaj nazwę użytkownika.');
      return;
    }
    if (/\s/.test(username) || !/^[A-Za-z0-9]+$/.test(username)) {
      this.settingsError.set('Użyj jednej nazwy z liter bez polskich znaków i cyfr.');
      return;
    }

    this.settingsSaving.set(true);
    this.settingsError.set(null);
    this.authService.updateSettings(username, this.settingsAccent).subscribe({
      next: () => {
        this.settingsSaving.set(false);
        this.settingsOpen.set(false);
      },
      error: (error: { error?: { error?: string } }) => {
        this.settingsSaving.set(false);
        this.settingsError.set(error.error?.error ?? 'Nie udało się zapisać ustawień.');
      },
    });
  }

  @HostListener('document:keydown.enter', ['$event'])
  onEnter(event: KeyboardEvent): void {
    if (!this.settingsOpen() || this.settingsSaving()) return;
    event.preventDefault();
    this.saveSettings();
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
