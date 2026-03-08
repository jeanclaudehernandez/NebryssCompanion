import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableProdMode } from '@angular/core';

// Crash loop detection and recovery
const CRASH_COUNT_KEY = 'app_crash_count';
const MAX_CRASHES = 3;

try {
  const crashCount = parseInt(localStorage.getItem(CRASH_COUNT_KEY) || '0', 10);

  if (crashCount >= MAX_CRASHES) {
    console.warn('Multiple crashes detected. Clearing site data to recover.');
    localStorage.clear();
    sessionStorage.clear();
    
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
    }
    
    // Reset crash count but keep it 0 to avoid immediate re-clearing if it crashes again immediately
    localStorage.setItem(CRASH_COUNT_KEY, '0');
  } else {
    localStorage.setItem(CRASH_COUNT_KEY, (crashCount + 1).toString());
  }

  // If app runs successfully for 5 seconds, reset crash count
  setTimeout(() => {
    localStorage.setItem(CRASH_COUNT_KEY, '0');
  }, 5000);

} catch (e) {
  console.error('Error in crash detection logic', e);
}

// Enable production mode for better performance
enableProdMode();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
