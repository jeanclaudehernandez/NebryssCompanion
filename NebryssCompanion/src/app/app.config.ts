import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withPreloading, NoPreloading } from '@angular/router';

import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { loadingInterceptor } from './loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ 
      eventCoalescing: true,
      runCoalescing: true
    }), 
    provideRouter(
      routes,
      withPreloading(NoPreloading)
    ), 
    provideHttpClient(
      withFetch(),
      withInterceptors([loadingInterceptor])
    ), 
    provideAnimationsAsync(), 
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
