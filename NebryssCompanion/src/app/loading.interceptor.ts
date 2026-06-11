import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from './loading.service';

export const SKIP_LOADING_HEADER = 'X-Skip-Loading';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.headers.has(SKIP_LOADING_HEADER)) {
    return next(req.clone({
      headers: req.headers.delete(SKIP_LOADING_HEADER)
    }));
  }

  const loadingService = inject(LoadingService);
  loadingService.show();
  return next(req).pipe(finalize(() => loadingService.hide()));
};
