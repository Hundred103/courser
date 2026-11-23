import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environment';
import { AccentColor, DEFAULT_ACCENT_COLOR, isAccentColor } from '../models/theme.model';

export interface AuthResponse {
  id: number;
  email: string;
  username: string;
  accentColor: AccentColor;
  token: string;
}

const STORAGE_KEY = 'user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly httpBackend = inject(HttpBackend);
  // HttpBackend: skip interceptor (circular dep with AuthService at bootstrap).
  private readonly sessionHttp = new HttpClient(this.httpBackend);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  private readonly currentUser = signal<AuthResponse | null>(this.loadStoredUser());
  private refreshInFlight$: Observable<boolean> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    // Refresh on init: HttpOnly cookie restores session even without localStorage.
    this.refreshAccessToken().subscribe({ error: () => undefined });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password }, { withCredentials: true });
  }

  register(email: string, password: string, username: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, {
      email,
      password,
      username,
    }, { withCredentials: true });
  }

  setCurrentUser(user: AuthResponse): void {
    const normalizedUser = { ...user, accentColor: isAccentColor(user.accentColor) ? user.accentColor : DEFAULT_ACCENT_COLOR };
    this.currentUser.set(normalizedUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedUser));
  }

  updateSettings(username: string, accentColor: AccentColor): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`${this.apiUrl}/me/settings`, { username, accentColor }).pipe(
      tap((user) => this.setCurrentUser(user)),
    );
  }

  getCurrentUser(): AuthResponse | null {
    return this.currentUser();
  }

  logout(revokeRefreshSession = true): void {
    if (revokeRefreshSession) {
      this.http.post<void>(`${this.apiUrl}/logout`, {}, { withCredentials: true }).subscribe({ error: () => undefined });
    }

    this.clearAuthState();
  }

  // false = 401/403 only; network/5xx rethrow (don't logout on blip).
  refreshAccessToken(): Observable<boolean> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.sessionHttp.post<AuthResponse>(`${this.apiUrl}/refresh`, {}, { withCredentials: true }).pipe(
      tap((user) => this.setCurrentUser(user)),
      map(() => true),
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || (error.status !== 401 && error.status !== 403)) {
          return throwError(() => error);
        }
        this.clearAuthState();
        return of(false);
      }),
      finalize(() => this.refreshInFlight$ = null),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshInFlight$;
  }

  private clearAuthState(): void {
    const userId = this.currentUser()?.id;
    if (userId != null) this.clearPlaySessionsForUser(userId);
    this.currentUser.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private clearPlaySessionsForUser(userId: number): void {
    const prefix = `courser.quiz-play.v1.${userId}.`;
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  }

  getToken(): string | null {
    return this.currentUser()?.token ?? null;
  }

  private loadStoredUser(): AuthResponse | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      const user = JSON.parse(stored) as AuthResponse;

      if (!Number.isFinite(user.id) || !user.email || !user.username || !user.token) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return { ...user, accentColor: isAccentColor(user.accentColor) ? user.accentColor : DEFAULT_ACCENT_COLOR };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
