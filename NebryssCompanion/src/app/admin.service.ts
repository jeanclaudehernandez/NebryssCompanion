import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private hasAdminAccessSubject = new BehaviorSubject<boolean>(
    localStorage.getItem('hasAdminAccess') === 'true'
  );
  hasAdminAccess$ = this.hasAdminAccessSubject.asObservable();

  private isAdminSubject = new BehaviorSubject<boolean>(
    localStorage.getItem('isAdmin') === 'true'
  );
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
