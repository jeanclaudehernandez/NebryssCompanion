
import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { ToastService } from './toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector, private zone: NgZone) {}

  handleError(error: any): void {
    const chunkFailedMessage = /Loading chunk [\d]+ failed/;
    
    // Check for chunk loading errors (often happens with new deployments)
    if (chunkFailedMessage.test(error.message)) {
      if (!sessionStorage.getItem('chunk_failed_reload')) {
        sessionStorage.setItem('chunk_failed_reload', 'true');
        window.location.reload();
        return;
      }
    }

    console.error('Global Error Handler caught:', error);

    // Try to notify user via ToastService (need injector to avoid circular dependency)
    try {
      const toastService = this.injector.get(ToastService);
      this.zone.run(() => {
        toastService.show('An error occurred. Please refresh if the app is stuck.', 'error');
      });
    } catch (e) {
      console.error('Could not show toast for error:', e);
    }

    // Check if this error happened very early (white screen scenario)
    // We can use a flag set in main.ts or AppComponent on successful init
    // If error happens before that flag is set, it might be a startup crash.
  }
}
