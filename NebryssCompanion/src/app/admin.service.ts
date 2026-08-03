import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  // hasAdminAccess is session-only: always starts false, requires re-authentication each page load
  private hasAdminAccessSubject = new BehaviorSubject<boolean>(false);
  hasAdminAccess$ = this.hasAdminAccessSubject.asObservable();

  private isAdminSubject = new BehaviorSubject<boolean>(false);
  isAdmin$ = this.isAdminSubject.asObservable();

  constructor() {}

  setAdminAuthenticated(authenticated: boolean): void {
    this.hasAdminAccessSubject.next(authenticated);
    localStorage.setItem('hasAdminAccess', String(authenticated));
    if (authenticated) {
      this.setAdminStatus(true);
    } else {
      this.setAdminStatus(false);
    }
  }

  setAdminStatus(isAdmin: boolean): void {
    this.isAdminSubject.next(isAdmin);
    localStorage.setItem('isAdmin', String(isAdmin));
  }

  get hasAdminAccess(): boolean {
    return this.hasAdminAccessSubject.value;
  }
  
  get isAdmin(): boolean {
    return this.isAdminSubject.value;
  }
}
