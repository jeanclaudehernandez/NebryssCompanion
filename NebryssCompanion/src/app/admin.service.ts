import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private hasAdminAccessSubject = new BehaviorSubject<boolean>(false);
  hasAdminAccess$ = this.hasAdminAccessSubject.asObservable();

  private isAdminSubject = new BehaviorSubject<boolean>(
    localStorage.getItem('isAdmin') !== 'false'
  );
  isAdmin$ = this.isAdminSubject.asObservable();

  constructor(private authService: AuthService) {
    this.authService.currentUser$.subscribe(user => {
      const hasAdmin = !!(user && (user.role === 'admin' || user.role === 'gm'));
      this.hasAdminAccessSubject.next(hasAdmin);
      if (!hasAdmin) {
        this.isAdminSubject.next(false);
      } else {
        const savedPref = localStorage.getItem('isAdmin') !== 'false';
        this.isAdminSubject.next(savedPref);
      }
    });
  }

  toggleGmMode(): boolean {
    if (!this.hasAdminAccess) return false;
    const nextState = !this.isAdminSubject.value;
    this.setAdminStatus(nextState);
    return nextState;
  }

  setAdminStatus(isAdmin: boolean): void {
    this.isAdminSubject.next(isAdmin);
    localStorage.setItem('isAdmin', String(isAdmin));
  }

  get hasAdminAccess(): boolean {
    return this.hasAdminAccessSubject.value;
  }
  
  get isAdmin(): boolean {
    return this.hasAdminAccessSubject.value && this.isAdminSubject.value;
  }
}
