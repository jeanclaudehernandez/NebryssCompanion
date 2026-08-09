import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BestiaryMaterialsService {
  private readonly countSubject = new BehaviorSubject<number>(0);
  private readonly openSubject = new BehaviorSubject<boolean>(false);

  readonly count$ = this.countSubject.asObservable();
  readonly open$ = this.openSubject.asObservable();

  get count(): number {
    return this.countSubject.value;
  }

  get isOpen(): boolean {
    return this.openSubject.value;
  }

  setCount(count: number): void {
    this.countSubject.next(count);
    if (count === 0) {
      this.openSubject.next(false);
    }
  }

  setOpen(isOpen: boolean): void {
    if (this.countSubject.value === 0) {
      this.openSubject.next(false);
      return;
    }

    this.openSubject.next(isOpen);
  }

  toggle(): void {
    this.setOpen(!this.openSubject.value);
  }

  close(): boolean {
    const wasOpen = this.openSubject.value;
    if (wasOpen) {
      this.openSubject.next(false);
    }
    return wasOpen;
  }

  reset(): void {
    this.countSubject.next(0);
    this.openSubject.next(false);
  }
}
