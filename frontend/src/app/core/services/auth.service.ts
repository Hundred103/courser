import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of, tap } from 'rxjs';
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
  message: string;
}

const STORAGE_KEY = 'user';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly guestQuizStorage = inject(GuestQuizStorageService);
  private readonly apiUrl = `${environment.apiUrl}/users`;
  private readonly quizzesApiUrl = `${environment.apiUrl}/quizzes`;

  private readonly currentUser = signal<AuthResponse | null>(this.loadStoredUser());

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password });
  }

  register(email: string, password: string, username: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, {
      email,
      password,
      username,
    });
  }

  setCurrentUser(user: AuthResponse): void {
    this.currentUser.set(user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  migrateGuestQuizzesToUser(user: AuthResponse): Observable<unknown[]> {
    const guestQuizzes = this.guestQuizStorage.getAllCreateDtos();

    if (guestQuizzes.length === 0) {
      return of([]);
    }

    return forkJoin(guestQuizzes.map((quiz) => this.http.post(this.quizzesApiUrl, quiz, { params: { userId: user.id } }))).pipe(
      tap(() => this.guestQuizStorage.clear()),
    );
  }

  getCurrentUser(): AuthResponse | null {
    return this.currentUser();
  }

  logout(): void {
    this.currentUser.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn();
  }

  private loadStoredUser(): AuthResponse | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      const user = JSON.parse(stored) as AuthResponse;

      if (!Number.isFinite(user.id) || !user.email || !user.username) {
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
