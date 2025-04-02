// modal.service.ts
import { Injectable, ComponentRef, createComponent, EnvironmentInjector, TemplateRef } from '@angular/core';
import { ModalComponent } from './modal/modal.component';

@Injectable({
  providedIn: 'root'
})
export class ModalService {
  private modalComponentRef: ComponentRef<ModalComponent> | null = null;

  constructor(private injector: EnvironmentInjector) {}

  openFromTemplate(template: TemplateRef<any>, context?: any) {
    this.close();
  
    this.modalComponentRef = createComponent(ModalComponent, {
      environmentInjector: this.injector
    });
  
    // Append to DOM and detect changes first
    document.body.appendChild(this.modalComponentRef.location.nativeElement);
    this.modalComponentRef.changeDetectorRef.detectChanges();
  
    // Now set the template and context
    this.modalComponentRef.instance.setTemplate(template, context);
    this.modalComponentRef.instance.close = () => this.close();
    this.modalComponentRef.changeDetectorRef.detectChanges();
  }

  close() {
    if (this.modalComponentRef) {
      this.modalComponentRef.destroy();
      this.modalComponentRef = null;
    }
  }
}