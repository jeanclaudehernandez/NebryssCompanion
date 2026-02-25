import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private isAdminSubject = new BehaviorSubject<boolean>(this.getInitialAdminValue());
  isAdmin$ = this.isAdminSubject.asObservable();

  constructor() {}

  private getInitialAdminValue(): boolean {
    const adminStored = localStorage.getItem('isAdmin');
    return adminStored === 'true';
  }

  setAdminStatus(isAdmin: boolean): void {
    this.isAdminSubject.next(isAdmin);
    localStorage.setItem('isAdmin', String(isAdmin));
  }
  
  get isAdmin(): boolean {
    return this.isAdminSubject.value;
  }
}
