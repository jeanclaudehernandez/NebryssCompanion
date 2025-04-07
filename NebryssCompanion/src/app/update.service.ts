import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class UpdateService {
  private timestampSubject = new BehaviorSubject<string>('');
  timestamp$ = this.timestampSubject.asObservable();

  constructor(private swUpdate: SwUpdate) {
    this.checkForUpdates();
    this.loadTimestamp();
  }

  private loadTimestamp() {
    fetch('/ngsw.json')
      .then(response => response.json())
      .then(data => {
        if (data && data.timestamp) {
          const date = new Date(data.timestamp);
          this.timestampSubject.next(date.toLocaleString());
        }
      })
      .catch(error => {
        console.error('Failed to fetch ngsw.json:', error);
        this.timestampSubject.next('Unknown');
      });
  }

  checkForUpdates() {
    if (!this.swUpdate.isEnabled) {
      console.log('Service worker updates are disabled');
      return;
    }

    this.swUpdate.versionUpdates.subscribe(event => {
      if (event.type === 'VERSION_READY') {
        console.log('New version available');
      }
    });
  }

  unregisterAndReload() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister();
        }
        // Clear caches
        if ('caches' in window) {
          caches.keys().then(cacheNames => {
            cacheNames.forEach(cacheName => {
              caches.delete(cacheName);
            });
          });
        }
        // Force reload
        window.location.reload();
      });
    }
  }

  clearStorageAndReload() {
    // Clear localStorage
    localStorage.clear();
    console.log('Local storage cleared');
    
    // Also do force update
    this.unregisterAndReload();
  }
} 