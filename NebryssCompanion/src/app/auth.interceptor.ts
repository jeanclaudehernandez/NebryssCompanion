import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // Ensure withCredentials: true so 30-day session cookies are sent/received
  let clonedReq = req.clone({
    withCredentials: true,
  });

  return next(clonedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        // If not already on an auth endpoint, mark session as unauthenticated
        if (!req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/register')) {
          authService.setUnauthenticated();
        }
      }
      return throwError(() => error);
    })
  );
};
