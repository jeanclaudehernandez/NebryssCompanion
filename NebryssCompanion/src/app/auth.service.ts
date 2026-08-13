import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { AuthResponse, AuthUser } from './auth.models';

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

  private currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  readonly currentUser$ = this.currentUserSubject.asObservable();
  readonly isAuthenticated$ = this.currentUserSubject.pipe(map((user) => !!user));

  private isLoadingSubject = new BehaviorSubject<boolean>(true);
  readonly isLoading$ = this.isLoadingSubject.asObservable();

  constructor(private http: HttpClient) {
    this.checkAuth();
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  checkAuth(): Observable<AuthUser | null> {
    this.isLoadingSubject.next(true);
    return this.http.get<{ authenticated: boolean; user: AuthUser }>(`${this.apiUrl}/auth/me`, {
      withCredentials: true,
    }).pipe(
      map((res) => {
        if (res && res.authenticated && res.user) {
          this.currentUserSubject.next(res.user);
          return res.user;
        }
        this.currentUserSubject.next(null);
        return null;
      }),
      catchError(() => {
        this.currentUserSubject.next(null);
        return of(null);
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
          this.currentUserSubject.next(res.user);
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
          this.currentUserSubject.next(res.user);
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
    return this.http.post(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true }).pipe(
      catchError(() => of({ success: true })),
      tap(() => {
        this.currentUserSubject.next(null);
      })
    );
  }

  setUnauthenticated(): void {
    this.currentUserSubject.next(null);
  }
}
