import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private hasAdminAccessSubject = new BehaviorSubject<boolean>(this.getInitialAdminAccess());
  hasAdminAccess$ = this.hasAdminAccessSubject.asObservable();

  private isAdminSubject = new BehaviorSubject<boolean>(this.getInitialAdminValue());
  isAdmin$ = this.isAdminSubject.asObservable();

  constructor() {}

  private getInitialAdminAccess(): boolean {
    return localStorage.getItem('hasAdminAccess') === 'true';
  }

  private getInitialAdminValue(): boolean {
    const hasAccess = this.getInitialAdminAccess();
    if (!hasAccess) {
      return false;
    }
    const adminStored = localStorage.getItem('isAdmin');
    return adminStored !== 'false';
  }

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
