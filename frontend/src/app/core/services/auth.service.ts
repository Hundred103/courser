import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, forkJoin, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environment';
import { GuestQuizStorageService } from './guest-quiz-storage.service';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
}

export interface AuthResponse {
  id: number;
  email: string;
  username: string;
  token: string;
  message: string;
}

const STORAGE_KEY = 'user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly httpBackend = inject(HttpBackend);
  // Odświeżenie sesji jest wykonywane już podczas tworzenia AuthService.
  // Omijamy interceptor, który sam wstrzykuje AuthService, aby nie tworzyć
  // cyklicznej zależności przy starcie aplikacji.
  private readonly sessionHttp = new HttpClient(this.httpBackend);
  private readonly guestQuizStorage = inject(GuestQuizStorageService);
  private readonly apiUrl = `${environment.apiUrl}/users`;
  private readonly quizzesApiUrl = `${environment.apiUrl}/quizzes`;

  private readonly currentUser = signal<AuthResponse | null>(this.loadStoredUser());
  private refreshInFlight$: Observable<boolean> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  constructor() {
    // Ciasteczko HttpOnly jest źródłem prawdy dla trwałej sesji. Odświeżamy ją
    // zawsze, także gdy wpis w localStorage nie istnieje albo został usunięty.
    // Dzięki temu zwykłe odświeżenie strony może odtworzyć zalogowanego użytkownika.
    this.refreshAccessToken().subscribe();
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
    this.currentUser.set(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  migrateGuestQuizzesToUser(user: AuthResponse): Observable<unknown[]> {
    const guestQuizzes = this.guestQuizStorage.getAllImports();

    if (guestQuizzes.length === 0) {
      return of([]);
    }

    return forkJoin(guestQuizzes.map(({ quiz, rankingVersionId }) => this.http.post(`${this.quizzesApiUrl}/import-archive`, {
      quiz,
      rankingVersionId,
      migratingGuestQuiz: true,
    }))).pipe(
      tap(() => this.guestQuizStorage.clear()),
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

  refreshAccessToken(): Observable<boolean> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.sessionHttp.post<AuthResponse>(`${this.apiUrl}/refresh`, {}, { withCredentials: true }).pipe(
      tap((user) => this.setCurrentUser(user)),
      map(() => true),
      catchError(() => {
        this.clearAuthState();
        return of(false);
      }),
      finalize(() => this.refreshInFlight$ = null),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshInFlight$;
  }

  private clearAuthState(): void {
    this.currentUser.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn();
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

      return user;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }
}
