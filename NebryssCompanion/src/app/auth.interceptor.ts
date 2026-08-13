import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  let headers = req.headers;
  if (token && !headers.has('Authorization')) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  // Ensure withCredentials: true so 30-day session cookies are sent/received
  const clonedReq = req.clone({
    headers,
    withCredentials: true,
  });

  return next(clonedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        if (!req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/register')) {
          authService.setUnauthenticated();
        }
      }
      return throwError(() => error);
    })
  );
};
