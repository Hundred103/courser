import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { AccentColor, DEFAULT_ACCENT_COLOR } from '../models/theme.model';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthService);

  constructor() {
    effect(() => this.apply(this.auth.user()?.accentColor));
  }

  private apply(color: AccentColor | undefined): void {
    document.documentElement.dataset['accent'] = color ?? DEFAULT_ACCENT_COLOR;
  }
}
