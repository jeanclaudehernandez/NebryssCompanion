import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { AuthResponse, AuthUser } from './auth.models';

const USER_STORAGE_KEY = 'nebryss_auth_user';
const TOKEN_STORAGE_KEY = 'nebryss_auth_token';

function loadInitialUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private get apiUrl(): string {
    const win = window as any;
    if (win.API_URL) {
      return win.API_URL;
    }
    return `${window.location.origin}/api`;
  }

  private initialUser = loadInitialUser();
  private currentUserSubject = new BehaviorSubject<AuthUser | null>(this.initialUser);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  readonly isAuthenticated$ = this.currentUserSubject.pipe(map((user) => !!user));

  private isLoadingSubject = new BehaviorSubject<boolean>(!this.initialUser);
  readonly isLoading$ = this.isLoadingSubject.asObservable();

  constructor(private http: HttpClient) {
    this.checkAuth().subscribe();
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  checkAuth(): Observable<AuthUser | null> {
    return this.http.get<{ authenticated: boolean; user: AuthUser }>(`${this.apiUrl}/auth/me`, {
      withCredentials: true,
    }).pipe(
      map((res) => {
        if (res && res.authenticated && res.user) {
          this.saveSession(res.user);
          return res.user;
        }
        this.clearSession();
        return null;
      }),
      catchError(() => {
        // If we don't have network or get 401, keep local session if valid or clear on 401
        return of(this.currentUserSubject.value);
      }),
      tap(() => {
        this.isLoadingSubject.next(false);
      })
    );
  }

  login(emailOrUsername: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, {
      emailOrUsername: emailOrUsername.trim(),
      password,
    }, { withCredentials: true }).pipe(
      tap((res) => {
        if (res && res.success && res.user) {
          this.saveSession(res.user, res.token);
        }
      })
    );
  }

  register(email: string, password: string, username?: string): Observable<AuthResponse> {
    const finalUsername = username ? username.trim() : email.trim().split('@')[0];
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, {
      email: email.trim(),
      username: finalUsername,
      password,
    }, { withCredentials: true });
  }

  validateEmail(email: string, code: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/validate-email`, {
      email: email.trim(),
      code: code.trim(),
    }, { withCredentials: true }).pipe(
      tap((res) => {
        if (res && res.success && res.user) {
          this.saveSession(res.user, res.token);
        }
      })
    );
  }

  resendCode(email: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/resend-code`, {
      email: email.trim(),
    }, { withCredentials: true });
  }

  logout(): Observable<any> {
    this.clearSession();
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).pipe(
      catchError(() => of({ success: true }))
    );
  }

  setUnauthenticated(): void {
    this.clearSession();
  }

  private saveSession(user: AuthUser, token?: string): void {
    this.currentUserSubject.next(user);
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      }
    } catch (e) {}
  }

  private clearSession(): void {
    this.currentUserSubject.next(null);
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (e) {}
  }
}
