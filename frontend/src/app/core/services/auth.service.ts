import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environment';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthResponse {
  id: number;
  email: string;
  displayName: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;
  
  private currentUser$ = new BehaviorSubject<AuthResponse | null>(null);
  
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, { email, password });
  }

  register(email: string, password: string, displayName: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, { 
      email, 
      password, 
      displayName 
    });
  }

  setCurrentUser(user: AuthResponse): void {
    this.currentUser$.next(user);
    localStorage.setItem('user', JSON.stringify(user));
  }

  getCurrentUser(): AuthResponse | null {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  logout(): void {
    this.currentUser$.next(null);
    localStorage.removeItem('user');
  }

  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  }
}
